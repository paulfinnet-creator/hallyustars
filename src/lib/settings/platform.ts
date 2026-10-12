/**
 * The platform settings admins can change (Settings page). The limits match
 * public.admin_update_setting(), which enforces them again.
 */
export const PLATFORM_SETTINGS = [
  { key: "invite_expiry_days", unit: "days", min: 1, max: 90, fallback: 14 },
  { key: "invite_max_email_attempts", unit: "attempts", min: 3, max: 20, fallback: 5 },
  { key: "invite_lock_minutes", unit: "minutes", min: 5, max: 1440, fallback: 60 },
  { key: "id_document_retention_days", unit: "days", min: 1, max: 90, fallback: 30 },
  { key: "chat_invitation_expiry_days", unit: "days", min: 1, max: 90, fallback: 14 },
  { key: "abandoned_registration_days", unit: "days", min: 7, max: 180, fallback: 30 },
] as const;

export type PlatformSettingKey = (typeof PLATFORM_SETTINGS)[number]["key"];
export type PlatformSettingValues = Record<PlatformSettingKey, number>;

/** Reads the stored values (jsonb numbers), falling back to the defaults. */
export function toSettingValues(rows: { key: string; value: unknown }[]): PlatformSettingValues {
  const stored = new Map(rows.map((row) => [row.key, Number(row.value)]));
  return Object.fromEntries(
    PLATFORM_SETTINGS.map(({ key, fallback }) => {
      const value = stored.get(key);
      return [key, Number.isInteger(value) ? value : fallback];
    }),
  ) as PlatformSettingValues;
}
