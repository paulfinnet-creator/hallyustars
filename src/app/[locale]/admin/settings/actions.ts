"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { z } from "zod";
import { SUPPORTED } from "@/i18n/config";
import { requireAdminAction } from "@/lib/auth/viewer";
import { PLATFORM_SETTINGS, type PlatformSettingValues } from "@/lib/settings/platform";
import { createAdminClient } from "@/lib/supabase/admin";

export type SettingsError =
  | "invalidName"
  | "invalidEmail"
  | "emailInUse"
  | "notAllowed"
  | "notFound"
  | "outOfRange"
  | "forbidden"
  | "failed";

type Result = { ok: true } | { ok: false; error: SettingsError };

function mapError(error: PostgrestError): SettingsError {
  switch (error.code) {
    case "42501":
      return "forbidden";
    case "22023":
      return "notAllowed";
    case "P0002":
      return "notFound";
    default:
      console.error("settings action failed", error.code);
      return "failed";
  }
}

// ── Admins ──

const newAdminSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().max(254),
  locale: z.enum(SUPPORTED),
});

/**
 * Create another admin's account. They sign in with an emailed code and set
 * up their authenticator app the first time. The record step writes the
 * audit row with this admin's session.
 */
export async function addAdmin(input: z.input<typeof newAdminSchema>): Promise<Result> {
  const parsed = newAdminSchema.safeParse({ ...input, email: input.email.trim().toLowerCase() });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.path[0] === "email" ? "invalidEmail" : "invalidName" };
  }
  const admin = await requireAdminAction();
  if (!admin) return { ok: false, error: "forbidden" };

  const service = createAdminClient();
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: parsed.data.email,
    email_confirm: true,
    app_metadata: { role: "admin" },
    user_metadata: { display_name: parsed.data.name, locale: parsed.data.locale },
  });
  if (createError || !created.user) {
    if (createError?.code === "email_exists") return { ok: false, error: "emailInUse" };
    console.error("admin account creation failed", createError?.code);
    return { ok: false, error: "failed" };
  }

  const { error } = await admin.supabase.rpc("admin_record_admin_created", { p_user_id: created.user.id });
  if (error) {
    // Never leave an admin account that isn't in the audit log.
    await service.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: mapError(error) };
  }
  refresh();
  return { ok: true };
}

const accessSchema = z.object({ userId: z.uuid(), active: z.boolean() });

/** Remove another admin's access (their account is kept), or give it back. */
export async function setAdminAccess(input: z.input<typeof accessSchema>): Promise<Result> {
  const parsed = accessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const admin = await requireAdminAction();
  if (!admin) return { ok: false, error: "forbidden" };

  const { error } = await admin.supabase.rpc("admin_set_admin_access", {
    p_user_id: parsed.data.userId,
    p_active: parsed.data.active,
  });
  if (error) return { ok: false, error: mapError(error) };
  refresh();
  return { ok: true };
}

/**
 * For an admin who lost their phone: remove their authenticator app. The
 * database records the reset and signs them out everywhere first; they set up
 * a new app at their next sign-in.
 */
export async function resetAuthenticator(input: { userId: string }): Promise<Result> {
  const userId = z.uuid().safeParse(input.userId);
  if (!userId.success) return { ok: false, error: "notFound" };
  const admin = await requireAdminAction();
  if (!admin) return { ok: false, error: "forbidden" };

  const { error } = await admin.supabase.rpc("admin_record_mfa_reset", { p_user_id: userId.data });
  if (error) return { ok: false, error: mapError(error) };

  const service = createAdminClient();
  const { data, error: listError } = await service.auth.admin.mfa.listFactors({ userId: userId.data });
  if (listError) {
    console.error("authenticator reset failed", listError.code);
    return { ok: false, error: "failed" };
  }
  for (const factor of data.factors) {
    const { error: deleteError } = await service.auth.admin.mfa.deleteFactor({ id: factor.id, userId: userId.data });
    if (deleteError) {
      console.error("authenticator reset failed", deleteError.code);
      return { ok: false, error: "failed" };
    }
  }
  refresh();
  return { ok: true };
}

// ── Platform settings ──

const settingsSchema = z.object(
  Object.fromEntries(PLATFORM_SETTINGS.map(({ key, min, max }) => [key, z.number().int().min(min).max(max)])) as Record<
    keyof PlatformSettingValues,
    z.ZodNumber
  >,
);

/** Saves the settings that changed; each change is audited by the database. */
export async function saveSettings(input: PlatformSettingValues): Promise<Result> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "outOfRange" };
  const admin = await requireAdminAction();
  if (!admin) return { ok: false, error: "forbidden" };

  const { data: current, error: readError } = await admin.supabase.from("platform_settings").select("key, value");
  if (readError) return { ok: false, error: mapError(readError) };
  const stored = new Map(current.map((row) => [row.key, Number(row.value)]));

  for (const { key } of PLATFORM_SETTINGS) {
    const value = parsed.data[key];
    if (stored.get(key) === value) continue;
    const { error } = await admin.supabase.rpc("admin_update_setting", { p_key: key, p_value: value });
    if (error) return { ok: false, error: error.code === "22023" ? "outOfRange" : mapError(error) };
  }
  refresh();
  return { ok: true };
}
