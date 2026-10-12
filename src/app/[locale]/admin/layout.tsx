import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui";
import { isLocale } from "@/i18n/config";
import { requireAdminPage } from "@/lib/auth/viewer";
import { signOut } from "../sign-in/actions";
import { AdminNav } from "./AdminNav";

export async function generateMetadata() {
  const t = await getTranslations("admin");
  return { title: t("title"), robots: { index: false } };
}

export default async function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  const { supabase, viewer } = await requireAdminPage(locale);
  const [{ count: pendingReviews }, { count: pendingInvitations }, { count: openReports }] = await Promise.all([
    supabase.from("verifications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("chat_invitations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString()),
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);
  const t = await getTranslations("admin");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <AdminNav
          waiting={{
            verifications: pendingReviews ?? 0,
            chatInvitations: pendingInvitations ?? 0,
            moderation: openReports ?? 0,
          }}
        />
        <form action={signOut} className="flex items-center gap-3">
          <span className="text-sm text-muted">{viewer.display_name}</span>
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="secondary">
            {t("signOut")}
          </Button>
        </form>
      </div>
      {children}
    </div>
  );
}
