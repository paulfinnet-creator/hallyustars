import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/LocalTime";
import { isLocale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { requireAdminPage } from "@/lib/auth/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReviewPanel } from "./ReviewPanel";

const PHOTO_URL_SECONDS = 300;

export default async function ReviewPage({ params }: PageProps<"/[locale]/admin/verifications/[id]">) {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  const { supabase } = await requireAdminPage(locale);
  const t = await getTranslations("admin.verifications");
  const tId = await getTranslations("register.idTypes");

  const { id } = await params;
  const { data: v } = await supabase
    .from("verifications")
    .select(
      "id, user_id, kind, status, id_document_type, id_document_path, profile_photo_path, created_at, fan:users!verifications_user_id_fkey(display_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!v) notFound();

  const { data: invite } = await supabase.from("invites").select("fan_name").eq("user_id", v.user_id).maybeSingle();
  // The profile photo isn't an ID document, so showing it isn't logged.
  const { data: photo } = await createAdminClient()
    .storage.from("id-documents")
    .createSignedUrl(v.profile_photo_path, PHOTO_URL_SECONDS);

  // A new profile photo is compared with the current one and, while it's
  // still kept, the ID from registration.
  let currentPhotoUrl: string | null = null;
  let idVerificationId: string | null = v.id_document_path ? v.id : null;
  if (v.kind === "profile_photo_change") {
    const [{ data: fan }, { data: registration }] = await Promise.all([
      supabase.from("users").select("avatar_url").eq("id", v.user_id).single(),
      supabase
        .from("verifications")
        .select("id")
        .eq("user_id", v.user_id)
        .eq("kind", "registration")
        .not("id_document_path", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    currentPhotoUrl = fan?.avatar_url ?? null;
    idVerificationId = registration?.id ?? null;
  }

  const name = v.fan?.display_name ?? "";
  return (
    <main className="flex flex-col gap-6">
      <Link href="/admin/verifications" className="self-start text-sm text-primary underline underline-offset-4">
        {t("backToQueue")}
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{t("reviewTitle", { name })}</h1>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-muted">{t("colKind")}:</dt>
            <dd>{t(`kinds.${v.kind}`)}</dd>
          </div>
          {invite && (
            <div className="flex gap-1.5">
              <dt className="text-muted">{t("inviteName")}:</dt>
              <dd className="font-medium">{invite.fan_name}</dd>
            </div>
          )}
          {v.id_document_type && (
            <div className="flex gap-1.5">
              <dt className="text-muted">{t("colDocument")}:</dt>
              <dd>{tId(v.id_document_type)}</dd>
            </div>
          )}
          <div className="flex gap-1.5">
            <dt className="text-muted">{t("colSubmitted")}:</dt>
            <dd>
              <LocalTime iso={v.created_at} options={{ dateStyle: "medium", timeStyle: "short" }} />
            </dd>
          </div>
        </dl>
      </div>
      <ReviewPanel
        verificationId={v.id}
        name={name}
        pending={v.status === "pending"}
        photoUrl={photo?.signedUrl ?? null}
        photoChange={v.kind === "profile_photo_change"}
        currentPhotoUrl={currentPhotoUrl}
        idVerificationId={idVerificationId}
      />
    </main>
  );
}
