import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requireAdminPage } from "@/lib/auth/viewer";
import { toSettingValues } from "@/lib/settings/platform";
import { AdminsSection } from "./AdminsSection";
import { PlatformSettingsForm } from "./PlatformSettingsForm";

export async function generateMetadata() {
  const t = await getTranslations("admin.settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  const { supabase, viewer } = await requireAdminPage(locale);
  const t = await getTranslations("admin.settings");

  const [{ data: admins, error: adminsError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.rpc("admin_list_admins"),
    supabase.from("platform_settings").select("key, value"),
  ]);
  if (adminsError) throw new Error(`admins query failed: ${adminsError.code}`);
  if (settingsError) throw new Error(`settings query failed: ${settingsError.code}`);

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <AdminsSection
        viewerId={viewer.id}
        admins={admins.map((admin) => ({
          id: admin.id,
          name: admin.display_name,
          active: admin.status === "approved",
          createdAt: admin.created_at,
          hasAuthenticator: admin.has_authenticator,
        }))}
      />
      <PlatformSettingsForm values={toSettingValues(settings)} />
    </main>
  );
}
