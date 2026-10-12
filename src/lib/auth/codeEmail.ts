import "server-only";
import type { Locale } from "@/i18n/config";
import { siteUrl } from "@/lib/notifications/recipient";

/**
 * signInWithOtp options for the emailed sign-in code. Only accounts our
 * server created can sign in (public sign-up is off). The redirect URL is
 * never visited (we email a code, not a link); it tells the Send Email Hook
 * (api/auth/send-email) which language the code was asked for in.
 */
export function codeEmailOptions(locale: Locale) {
  return { shouldCreateUser: false, emailRedirectTo: siteUrl(`/${locale}/sign-in`) };
}
