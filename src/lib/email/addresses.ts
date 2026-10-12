import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";

/**
 * Sender and reply addresses (CLAUDE.md › Email notifications). Replies go to
 * the reply subdomain, tagged with the recipient's language so the
 * auto-response can answer in it: no-reply+ar@reply.hallyustars.org.
 */

export const FROM = "Hallyu Stars <notifications@hallyustars.org>";
export const AUTO_REPLY_FROM = "Hallyu Stars <no-reply@reply.hallyustars.org>";
export const REPLY_DOMAIN = "reply.hallyustars.org";

export function replyToFor(locale: Locale): string {
  return `no-reply+${locale}@${REPLY_DOMAIN}`;
}

/** The language tag in the first reply-domain address, or English. */
export function localeFromReplyAddresses(addresses: readonly string[]): Locale {
  for (const raw of addresses) {
    const match = /<?([^<>\s]+)@([^<>\s]+?)>?$/.exec(raw.trim());
    if (!match || match[2]!.toLowerCase() !== REPLY_DOMAIN) continue;
    const tag = match[1]!.toLowerCase().split("+")[1];
    return tag && isLocale(tag) ? tag : DEFAULT_LOCALE;
  }
  return DEFAULT_LOCALE;
}

/** Addresses that are machines, not people: never auto-reply to them. */
export function isAutomatedSender(address: string, subject: string): boolean {
  const local = address.trim().toLowerCase().split("@")[0] ?? "";
  const domain = address.trim().toLowerCase().split("@")[1] ?? "";
  if (domain === REPLY_DOMAIN || domain === "hallyustars.org") return true;
  if (/^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounces?|notifications?)([+._-].*)?$/.test(local)) return true;
  return /^(auto(matic)?[ -]?(reply|response)|out of (the )?office|undeliver|delivery status|returned mail|autosvar|abwesenheit|r[ée]ponse automatique|自动回复|自動返信|자동 ?응답)/i.test(
    subject.trim(),
  );
}
