import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requireChatPage } from "@/lib/auth/viewer";
import { previewUrl } from "@/lib/images/fanPhotos";
import { createAdminClient } from "@/lib/supabase/admin";
import { ChatEmailsToggle } from "./ChatEmailsToggle";
import { ProfilePhotoSection } from "./ProfilePhotoSection";

export async function generateMetadata() {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  const { supabase, viewer } = await requireChatPage(locale);
  const t = await getTranslations("settings");

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("chat_emails_enabled")
    .eq("user_id", viewer.id)
    .maybeSingle();
  if (error) throw new Error(`settings query failed: ${error.code}`);

  // Fans change their own photo; celebrities' photos are managed by admins.
  const photo = viewer.role === "fan" ? await loadPhotoState(supabase, viewer.id) : null;

  return (
    <main className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      {photo && <ProfilePhotoSection {...photo} />}
      <section aria-labelledby="emails-title" className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <h2 id="emails-title" className="text-lg font-semibold">
          {t("emailsTitle")}
        </h2>
        <ChatEmailsToggle initial={data?.chat_emails_enabled ?? true} />
      </section>
    </main>
  );
}

type Supabase = Awaited<ReturnType<typeof requireChatPage>>["supabase"];

/** The current photo, a new one waiting for review, or why the last one was refused. */
async function loadPhotoState(supabase: Supabase, userId: string) {
  const [{ data: me }, { data: latest }] = await Promise.all([
    supabase.from("users").select("avatar_url").eq("id", userId).single(),
    supabase.rpc("my_photo_change").maybeSingle(),
  ]);
  let pendingUrl: string | null = null;
  if (latest?.status === "pending") {
    // The fan can't read verification rows; look up their own pending photo here.
    const { data: pending } = await createAdminClient()
      .from("verifications")
      .select("profile_photo_path")
      .eq("user_id", userId)
      .eq("kind", "profile_photo_change")
      .eq("status", "pending")
      .maybeSingle();
    if (pending) pendingUrl = await previewUrl(pending.profile_photo_path.replace(/\.jpg$/, "-400.jpg"));
  }
  return {
    currentUrl: me?.avatar_url ?? null,
    pendingUrl,
    rejectedReason: latest?.status === "rejected" ? latest.reason : null,
  };
}
