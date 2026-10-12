import { z } from "zod";
import { isLocale, type Locale } from "@/i18n/config";
import { FROM, replyToFor } from "@/lib/email/addresses";
import { signInCodeEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/transport";
import { isValidWebhook } from "@/lib/email/webhook";
import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Supabase Auth's Send Email Hook: Auth hands us the sign-in code instead of
 * sending its own (English-only) email, and we send it in the person's
 * language. Never log the code or the address.
 */

/** Matches [auth.email] otp_expiry (600 s) in supabase/config.toml and the dashboard. */
const CODE_MINUTES = 10;

// Only these are used: signInWithOtp sends "magiclink" (or "signup"/"email"
// for an account that isn't confirmed yet). Other kinds are refused.
const SIGN_IN_TYPES = new Set(["magiclink", "signup", "email"]);

const payloadSchema = z.object({
  user: z.object({ id: z.uuid(), email: z.email() }),
  email_data: z.object({
    token: z.string().regex(/^\d{6}$/),
    email_action_type: z.string(),
    redirect_to: z.string().default(""),
  }),
});

function hookError(status: number, message: string) {
  return Response.json({ error: { http_code: status, message } }, { status });
}

/** The language of the page the code was asked for from (/ko/sign-in → ko). */
function localeFromRedirect(redirectTo: string): Locale | null {
  try {
    const first = new URL(redirectTo).pathname.split("/")[1] ?? "";
    return isLocale(first) ? first : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = await request.text();
  const valid = isValidWebhook({
    secret: serverEnv("SEND_EMAIL_HOOK_SECRET"),
    id: request.headers.get("webhook-id"),
    timestamp: request.headers.get("webhook-timestamp"),
    signature: request.headers.get("webhook-signature"),
    body,
  });
  if (!valid) return hookError(401, "invalid signature");

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return hookError(400, "bad request");
  }
  const payload = payloadSchema.safeParse(json);
  if (!payload.success) return hookError(400, "bad request");
  const { user, email_data: data } = payload.data;
  if (!SIGN_IN_TYPES.has(data.email_action_type)) return hookError(400, "unsupported email");

  // The page's language first, then the saved one, then English.
  let locale = localeFromRedirect(data.redirect_to);
  if (!locale) {
    const { data: profile } = await createAdminClient().from("users").select("locale").eq("id", user.id).maybeSingle();
    locale = profile && isLocale(profile.locale) ? profile.locale : "en";
  }

  const email = await signInCodeEmail({ locale, code: data.token, minutes: CODE_MINUTES });
  try {
    await sendEmail({ from: FROM, to: user.email, replyTo: replyToFor(locale), ...email });
  } catch (error) {
    console.error("sign-in code email failed", error instanceof Error ? error.message : "unknown");
    return hookError(500, "email failed");
  }
  return Response.json({});
}
