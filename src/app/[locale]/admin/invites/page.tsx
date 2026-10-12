import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requireAdminPage } from "@/lib/auth/viewer";
import { displayInviteStatus } from "@/lib/invites/status";
import { InvitesManager, type InviteRow } from "./InvitesManager";

const PAGE_SIZE = 25;

export default async function InvitesPage({ searchParams }: PageProps<"/[locale]/admin/invites">) {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  const { supabase } = await requireAdminPage(locale);
  const t = await getTranslations("admin.invites");

  const pageParam = Number((await searchParams).page);
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1;
  const from = (page - 1) * PAGE_SIZE;

  // No email or code in the list: both are only shown right after issuing.
  const { data, count, error } = await supabase
    .from("invites")
    .select(
      "id, fan_name, status, expires_at, created_at, creator:users!invites_created_by_admin_fkey(display_name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(`invites query failed: ${error.code}`);

  const now = new Date();
  const rows: InviteRow[] = data.map((invite) => ({
    id: invite.id,
    fanName: invite.fan_name,
    status: displayInviteStatus(invite.status, invite.expires_at, now),
    expiresAt: invite.expires_at,
    createdAt: invite.created_at,
    createdBy: invite.creator?.display_name ?? "",
  }));

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <InvitesManager
        rows={rows}
        page={page}
        totalPages={Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))}
      />
    </main>
  );
}
