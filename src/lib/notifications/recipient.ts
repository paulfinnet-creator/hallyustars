import "server-only";
import { isLocale, type Locale } from "@/i18n/config";
import { publicEnv } from "@/lib/env";
import { replyToFor } from "@/lib/email/addresses";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type Recipient = {
  id: string;
  email: string;
  locale: Locale;
  timeZone: string;
  unsubscribeToken: string;
};

/**
 * Everything needed to email one member. The address comes from the account
 * system (auth.users) and is used only to send; it is never stored elsewhere
 * or logged.
 */
export async function loadRecipient(admin: Admin, userId: string): Promise<Recipient | null> {
  const [profile, prefs, account] = await Promise.all([
    admin.from("users").select("locale, timezone").eq("id", userId).maybeSingle(),
    admin.from("notification_preferences").select("unsubscribe_token").eq("user_id", userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);
  const email = account.data.user?.email;
  if (!profile.data || !prefs.data || !email) return null;
  return {
    id: userId,
    email,
    locale: isLocale(profile.data.locale) ? profile.data.locale : "en",
    timeZone: profile.data.timezone,
    unsubscribeToken: prefs.data.unsubscribe_token,
  };
}

export function siteUrl(path: string): string {
  return `${publicEnv.NEXT_PUBLIC_SITE_URL}${path}`;
}

/** Reply-To and the one-click unsubscribe headers every email carries. */
export function standardHeaders(recipient: Recipient) {
  return {
    replyTo: replyToFor(recipient.locale),
    headers: {
      "List-Unsubscribe": `<${siteUrl(`/api/unsubscribe?token=${recipient.unsubscribeToken}`)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
