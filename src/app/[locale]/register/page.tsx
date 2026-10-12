import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui";
import { isLocale } from "@/i18n/config";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { signOut } from "../sign-in/actions";
import { RegisterFlow } from "./RegisterFlow";

export async function generateMetadata() {
  const t = await getTranslations("register");
  return { title: t("title"), robots: { index: false } };
}

const PREVIEW_SECONDS = 600;

export default async function RegisterPage() {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();

  const { supabase, viewer } = await getViewer();
  if (!viewer) return redirect({ href: "/sign-in", locale });
  if (viewer.role !== "fan" || viewer.status === "approved" || viewer.status === "suspended") {
    return redirect({ href: "/", locale });
  }
  const t = await getTranslations("register");

  let body;
  if (viewer.status === "registering") {
    // Resume where the fan stopped: show what they already uploaded.
    const admin = createAdminClient();
    const { data: draft } = await admin
      .from("registration_drafts")
      .select("profile_photo_path, id_document_path, id_document_type")
      .eq("user_id", viewer.id)
      .maybeSingle();
    const storage = admin.storage.from("id-documents");
    const sign = async (path: string | null | undefined) =>
      path ? ((await storage.createSignedUrl(path, PREVIEW_SECONDS)).data?.signedUrl ?? null) : null;

    body = (
      <RegisterFlow
        initialPhotoUrl={await sign(draft?.profile_photo_path?.replace(/\.jpg$/, "-400.jpg"))}
        initialIdUrl={await sign(draft?.id_document_path)}
        initialIdType={draft?.id_document_type ?? null}
      />
    );
  } else if (viewer.status === "pending_review") {
    body = (
      <section role="status" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-xl font-semibold">{t("pendingTitle")}</h2>
        <p className="text-muted">{t("pendingBody")}</p>
      </section>
    );
  } else {
    const { data: result } = await supabase.rpc("my_verification").maybeSingle();
    body = (
      <section className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-surface p-6 shadow-sm">
        <h2 className="text-xl font-semibold">{t("rejectedTitle")}</h2>
        {result?.reason && <p>{t("rejectedReason", { reason: result.reason })}</p>}
        <p className="text-muted">{t("rejectedBody")}</p>
      </section>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <form action={signOut}>
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="secondary">
            {t("signOut")}
          </Button>
        </form>
      </div>
      {body}
    </main>
  );
}
