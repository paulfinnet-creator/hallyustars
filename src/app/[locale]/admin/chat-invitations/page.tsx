import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { ApprovedSeal } from "@/components/ApprovedSeal";
import { LocalTime } from "@/components/LocalTime";
import { isLocale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { requireAdminPage } from "@/lib/auth/viewer";
import { cardUrl } from "@/lib/celebrities/photo";
import { displayInvitationStatus } from "@/lib/chat-invitations/status";
import { DecisionButtons } from "./DecisionButtons";

const DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
const SELECT =
  "id, status, message, reason, expires_at, created_at, decided_at, fan:users!chat_invitations_fan_id_fkey(display_name, avatar_url), decider:users!chat_invitations_decided_by_admin_fkey(display_name), celebrity:celebrity_profiles(id, stage_name, photo_url, user_id)";

export default async function ChatInvitationQueuePage({ searchParams }: PageProps<"/[locale]/admin/chat-invitations">) {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  const { supabase } = await requireAdminPage(locale);
  const t = await getTranslations("admin.chatInvitations");
  const history = (await searchParams).view === "history";
  const nowIso = new Date().toISOString();

  // Waiting: oldest first, so nobody waits longest. History: latest changes first.
  const query = history
    ? supabase.from("chat_invitations").select(SELECT).or(`status.neq.pending,expires_at.lte."${nowIso}"`).order("updated_at", { ascending: false }).limit(50)
    : supabase.from("chat_invitations").select(SELECT).eq("status", "pending").gt("expires_at", nowIso).order("created_at").limit(200);
  const { data, error } = await query;
  if (error) throw new Error(`chat invitation queue query failed: ${error.code}`);
  const now = new Date(nowIso);

  const tab = "rounded-full px-3 py-1 text-sm font-medium text-ink hover:bg-band aria-[current=page]:bg-band";

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">{t("title")}</h1>
        {!history && <p className="text-muted">{t("pendingCount", { count: data.length })}</p>}
      </div>

      <nav aria-label={t("viewsLabel")} className="flex gap-2">
        <Link href="/admin/chat-invitations" aria-current={history ? undefined : "page"} className={tab}>
          {t("viewWaiting")}
        </Link>
        <Link href={{ pathname: "/admin/chat-invitations", query: { view: "history" } }} aria-current={history ? "page" : undefined} className={tab}>
          {t("viewHistory")}
        </Link>
      </nav>

      {data.length === 0 ? (
        <p className="text-muted">{history ? t("emptyHistory") : t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {data.map((inv) => {
            const fanName = inv.fan?.display_name ?? "";
            const c = inv.celebrity;
            const status = displayInvitationStatus(inv.status, inv.expires_at, now);
            return (
              <li key={inv.id} className="grid gap-4 rounded-xl border border-border bg-surface p-4 md:grid-cols-[1fr_auto]">
                <div className="flex min-w-0 flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-2">
                      <span className="size-10 shrink-0 overflow-hidden rounded-full border border-border bg-band">
                        {inv.fan?.avatar_url && (
                          // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL
                          <img src={inv.fan.avatar_url} alt="" className="h-full w-full object-cover" />
                        )}
                      </span>
                      <span className="font-medium">{fanName}</span>
                    </span>
                    <span aria-hidden="true" className="text-muted rtl:-scale-x-100">→</span>
                    <span className="sr-only">{t("invites")}</span>
                    {c && (
                      <Link href={`/admin/celebrities/${c.id}`} className="flex items-center gap-2 hover:underline">
                        <span className="aspect-[3/4] w-8 shrink-0 overflow-hidden rounded border border-gold bg-band">
                          {c.photo_url && (
                            // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL
                            <img src={cardUrl(c.photo_url)} alt="" className="h-full w-full object-cover" />
                          )}
                        </span>
                        <span className="font-medium">{c.stage_name}</span>
                      </Link>
                    )}
                  </div>
                  <blockquote className="border-s-2 border-gold ps-3 whitespace-pre-line break-words">{inv.message}</blockquote>
                  <p className="text-xs text-muted">
                    {t.rich("sentOn", { date: () => <LocalTime iso={inv.created_at} options={DATE_TIME} /> })}
                    {!history && (
                      <>
                        {" · "}
                        {t.rich("expiresOn", { date: () => <LocalTime iso={inv.expires_at} options={DATE_TIME} /> })}
                      </>
                    )}
                  </p>
                  {history && (
                    <p className="text-sm">
                      <span className="font-medium">{t(`status.${status}`)}</span>
                      {inv.decided_at && inv.decider && (
                        <span className="text-muted">
                          {" · "}
                          {t.rich("decidedBy", {
                            name: inv.decider.display_name,
                            date: () => <LocalTime iso={inv.decided_at!} options={DATE_TIME} />,
                          })}
                        </span>
                      )}
                      {inv.reason && (
                        <span className="block text-muted">
                          {t("reasonShown")} <span className="italic">{inv.reason}</span>
                        </span>
                      )}
                    </p>
                  )}
                  {!history && c && !c.user_id && <p className="text-sm text-accent">{t("noLoginWarning")}</p>}
                </div>
                <div className="flex items-start md:justify-end">
                  {history ? (
                    status === "approved" && <ApprovedSeal label={t("status.approved")} />
                  ) : (
                    <DecisionButtons
                      invitationId={inv.id}
                      fanName={fanName}
                      celebrityName={c?.stage_name ?? ""}
                      canApprove={Boolean(c?.user_id)}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
