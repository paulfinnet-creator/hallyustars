import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isLocale, type Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { requireAdminPage } from "@/lib/auth/viewer";
import type { Category } from "@/lib/celebrities/fields";
import { cardUrl } from "@/lib/celebrities/photo";
import { isTranslationConfigured } from "@/lib/translation/deepl";
import { ProfileForm } from "../ProfileForm";
import { AccountSection } from "./AccountSection";
import { BioSection } from "./BioSection";
import { PhotoSection } from "./PhotoSection";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function EditCelebrityPage({ params }: PageProps<"/[locale]/admin/celebrities/[id]">) {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  const { supabase } = await requireAdminPage(locale);
  const t = await getTranslations("admin.celebrities");

  const { id } = await params;
  const { data: c } = await supabase
    .from("celebrity_profiles")
    .select(
      "id, stage_name, category, group_name, languages, timezone, accepts_invites, photo_url, bio_source_locale, bio_updated_at, account:users(display_name), translations:celebrity_profile_translations(locale, bio, is_machine_translated, updated_at)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();

  return (
    <main className="flex flex-col gap-6">
      <Link href="/admin/celebrities" className="self-start text-sm text-primary underline underline-offset-4">
        {t("backToList")}
      </Link>
      <h1 className="text-3xl font-semibold break-words">{c.stage_name}</h1>

      <Section id="profile-title" title={t("sectionProfile")}>
        <ProfileForm
          profileId={c.id}
          timeZones={Intl.supportedValuesOf("timeZone")}
          initial={{
            stageName: c.stage_name,
            category: c.category as Category,
            groupName: c.group_name ?? "",
            languages: c.languages as Locale[],
            timezone: c.timezone,
            acceptsInvites: c.accepts_invites,
          }}
        />
      </Section>

      <Section id="photo-title" title={t("sectionPhoto")}>
        <PhotoSection profileId={c.id} name={c.stage_name} cardUrl={c.photo_url ? cardUrl(c.photo_url) : null} />
      </Section>

      <Section id="bio-title" title={t("sectionBio")}>
        <BioSection
          profileId={c.id}
          sourceLocale={c.bio_source_locale as "ko" | "en" | null}
          bioUpdatedAt={c.bio_updated_at}
          translationConfigured={isTranslationConfigured()}
          rows={c.translations.map((r) => ({
            locale: r.locale as Locale,
            bio: r.bio,
            isMachine: r.is_machine_translated,
            updatedAt: r.updated_at,
          }))}
        />
      </Section>

      <Section id="account-title" title={t("sectionAccount")}>
        <AccountSection profileId={c.id} linkedName={c.account?.display_name ?? null} />
      </Section>
    </main>
  );
}
