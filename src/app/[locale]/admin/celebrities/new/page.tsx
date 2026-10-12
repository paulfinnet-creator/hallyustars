import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { requireAdminPage } from "@/lib/auth/viewer";
import { NEW_PROFILE, ProfileForm } from "../ProfileForm";

export default async function NewCelebrityPage() {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  await requireAdminPage(locale);
  const t = await getTranslations("admin.celebrities");

  return (
    <main className="flex flex-col gap-6">
      <Link href="/admin/celebrities" className="self-start text-sm text-primary underline underline-offset-4">
        {t("backToList")}
      </Link>
      <h1 className="text-3xl font-semibold">{t("new")}</h1>
      <p className="text-muted">{t("newIntro")}</p>
      <section className="rounded-xl border border-border bg-surface p-5">
        <ProfileForm initial={NEW_PROFILE} timeZones={Intl.supportedValuesOf("timeZone")} />
      </section>
    </main>
  );
}
