"use server";

import type { AuthError } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isLocale, SUPPORTED, type Locale } from "@/i18n/config";
import { codeEmailOptions } from "@/lib/auth/codeEmail";
import { getViewer, isAdmin, landingFor } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

export type SignInError = "invalidEmail" | "invalidCode" | "rateLimited" | "unknown";

const emailSchema = z.email().max(254);
const codeSchema = z.string().regex(/^\d{6}$/);

function isRateLimited(error: AuthError) {
  return error.status === 429 || (error.code ?? "").startsWith("over_");
}

/**
 * Email a 6-digit code. Unknown addresses get the same answer as known ones,
 * so this can't be used to find out who has an account. Only accounts our
 * server created can sign in (shouldCreateUser: false; public sign-up is off).
 */
export async function requestCode(email: string, locale: Locale): Promise<{ ok: true } | { error: SignInError }> {
  const parsed = emailSchema.safeParse(email.trim());
  if (!parsed.success) return { error: "invalidEmail" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: codeEmailOptions(z.enum(SUPPORTED).catch("en").parse(locale)),
  });
  if (error && isRateLimited(error)) return { error: "rateLimited" };
  // Any other error (most often "no such account") is deliberately not shown.
  return { ok: true };
}

const verifySchema = z.object({
  email: emailSchema,
  code: codeSchema,
  timeZone: z.string().max(64),
});

/** Check the emailed code. Admins continue to the authenticator step. */
export async function verifyCode(
  input: z.infer<typeof verifySchema>,
): Promise<{ next: "mfa" } | { next: "done"; href: string } | { error: SignInError }> {
  const parsed = verifySchema.safeParse({ ...input, email: input.email.trim() });
  if (!parsed.success) return { error: "invalidCode" };
  const { email, code, timeZone } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user) {
    return { error: error && isRateLimited(error) ? "rateLimited" : "invalidCode" };
  }

  // Keep the saved timezone current (CLAUDE.md › Time and dates). The database
  // rejects anything that isn't a real IANA zone, so a failure is ignored.
  await supabase.from("users").update({ timezone: timeZone }).eq("id", data.user.id);

  const { data: profile } = await supabase
    .from("users")
    .select("role, status")
    .eq("id", data.user.id)
    .single();
  const landing = profile ? landingFor(profile) : "/";
  return landing === "mfa" ? { next: "mfa" } : { next: "done", href: landing };
}

export type MfaStart =
  | { step: "verify"; factorId: string }
  | { step: "enroll"; factorId: string; qrCode: string; secret: string };

/**
 * Begin the authenticator step for a signed-in admin: a challenge for their
 * app, or, the first time, a new TOTP factor to scan.
 */
export async function startMfa(): Promise<MfaStart | { error: SignInError }> {
  const { supabase, viewer } = await getViewer();
  if (!isAdmin(viewer)) return { error: "unknown" };

  const { data: factors, error } = await supabase.auth.mfa.listFactors();
  if (error) return { error: "unknown" };

  const verified = factors.totp[0];
  if (verified) return { step: "verify", factorId: verified.id };

  // Clear abandoned set-up attempts so the new factor's name is free.
  for (const factor of factors.all) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: "Hallyu Stars",
    friendlyName: "Authenticator app",
  });
  if (enrollError) return { error: "unknown" };
  return {
    step: "enroll",
    factorId: enrolled.id,
    qrCode: enrolled.totp.qr_code,
    secret: enrolled.totp.secret,
  };
}

const totpSchema = z.object({ factorId: z.uuid(), code: codeSchema });

/** Check the authenticator code; on success the session becomes aal2. */
export async function verifyMfa(
  input: z.infer<typeof totpSchema>,
): Promise<{ href: string } | { error: SignInError }> {
  const parsed = totpSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidCode" };

  const { supabase, viewer } = await getViewer();
  if (!isAdmin(viewer)) return { error: "unknown" };

  const { error } = await supabase.auth.mfa.challengeAndVerify(parsed.data);
  if (error) return { error: isRateLimited(error) ? "rateLimited" : "invalidCode" };
  return { href: "/admin/invites" };
}

export async function signOut(formData: FormData) {
  const locale = String(formData.get("locale") ?? "");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(isLocale(locale) ? `/${locale}/sign-in` : "/sign-in");
}
