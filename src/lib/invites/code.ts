/**
 * Invite codes (CLAUDE.md › Invite code rules). Stored normalized without
 * dashes (SKCE7K4MQ2PX), displayed as SKCE-7K4M-Q2PX. Generation happens in
 * the database (private.generate_invite_code); this mirrors its format rules.
 */

const NORMALIZED = /^SKCE[2-9A-HJKMNP-Z]{8}$/;
const BODY = /^[2-9A-HJKMNP-Z]{8}$/;

/** Same rules as public.normalize_invite_code(): case, spaces and dashes ignored; prefix optional. */
export function normalizeInviteCode(input: string): string | null {
  const v = input.replace(/[\s-]/g, "").toUpperCase();
  if (NORMALIZED.test(v)) return v;
  if (BODY.test(v)) return `SKCE${v}`;
  return null;
}

/** SKCE7K4MQ2PX → SKCE-7K4M-Q2PX */
export function formatInviteCode(normalized: string): string {
  if (!NORMALIZED.test(normalized)) throw new Error("Not a normalized invite code");
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8)}`;
}

/** https://hallyustars.org/invite/SKCE-7K4M-Q2PX (no locale: the visitor's own is chosen on arrival). */
export function inviteLink(siteUrl: string, normalized: string): string {
  return new URL(`/invite/${formatInviteCode(normalized)}`, siteUrl).toString();
}
