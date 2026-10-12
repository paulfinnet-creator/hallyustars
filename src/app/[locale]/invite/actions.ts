"use server";

import { z } from "zod";
import { SUPPORTED } from "@/i18n/config";
import { codeEmailOptions } from "@/lib/auth/codeEmail";
import { clientIp, withinRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Matches the invite error messages in CLAUDE.md › Registration. */
export type InviteError =
  | "unknown"
  | "used"
  | "expired"
  | "revoked"
  | "locked"
  | "mismatch"
  | "invalidEmail"
  | "rateLimited"
  | "failed";

/** Results from registration_check_code / registration_check_email that mean "no". */
const REFUSALS = ["unknown", "used", "expired", "revoked", "locked", "mismatch"] as const;

function asInviteError(result: string): InviteError {
  return (REFUSALS as readonly string[]).includes(result) ? (result as InviteError) : "failed";
}

const codeSchema = z.string().trim().min(1).max(40);

/** Step 1: is this code usable? Rate-limited per IP so codes can't be guessed. */
export async function checkInviteCode(code: string): Promise<{ ok: true } | { error: InviteError }> {
  const parsed = codeSchema.safeParse(code);
  if (!parsed.success) return { error: "unknown" };
  if (!(await withinRateLimit(`invite-code:${await clientIp()}`, 20, 600))) return { error: "rateLimited" };

  const { data, error } = await createAdminClient().rpc("registration_check_code", { p_code: parsed.data });
  if (error) {
    console.error("invite code check failed", error.code);
    return { error: "failed" };
  }
  return data === "ok" ? { ok: true } : { error: asInviteError(data) };
}

const emailStepSchema = z.object({
  code: codeSchema,
  email: z.email().max(254),
  locale: z.enum(SUPPORTED),
  timeZone: z.string().max(64),
});

/**
 * Step 2: the email must be the one the admin used for this invite (wrong
 * emails count towards the invite's lockout). On a match, create the fan's
 * account the first time, then email a sign-in code. Re-entering the same
 * code and email later resumes registration the same way.
 */
export async function startRegistration(
  input: z.infer<typeof emailStepSchema>,
): Promise<{ ok: true } | { error: InviteError }> {
  const parsed = emailStepSchema.safeParse({ ...input, email: input.email.trim() });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.path[0] === "email" ? "invalidEmail" : "failed" };
  }
  const { code, email, locale, timeZone } = parsed.data;
  if (!(await withinRateLimit(`invite-email:${await clientIp()}`, 20, 600))) return { error: "rateLimited" };

  const admin = createAdminClient();
  const { data: check, error } = await admin
    .rpc("registration_check_email", { p_code: code, p_email: email })
    .single();
  if (error) {
    console.error("invite email check failed", error.code);
    return { error: "failed" };
  }
  if (check.result !== "match") return { error: asInviteError(check.result) };

  if (!check.user_id) {
    // First time: create the account. Role and status are set by the
    // database triggers; the display name comes from the invite.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { role: "fan" },
      user_metadata: { display_name: check.fan_name, locale, timezone: timeZone },
    });
    if (createError || !created.user) {
      console.error("fan account creation failed", createError?.code);
      return { error: "failed" };
    }
    const { data: linked } = await admin.rpc("registration_link_user", {
      p_invite_id: check.invite_id,
      p_user_id: created.user.id,
    });
    if (!linked) {
      await admin.auth.admin.deleteUser(created.user.id);
      return { error: "failed" };
    }
  }

  const supabase = await createClient();
  const { error: otpError } = await supabase.auth.signInWithOtp({ email, options: codeEmailOptions(locale) });
  if (otpError) {
    if (otpError.status === 429 || (otpError.code ?? "").startsWith("over_")) return { error: "rateLimited" };
    console.error("registration code email failed", otpError.code);
    return { error: "failed" };
  }
  return { ok: true };
}
