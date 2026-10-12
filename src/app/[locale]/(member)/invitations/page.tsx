import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { ApprovedSeal } from "@/components/ApprovedSeal";
import { LocalTime } from "@/components/LocalTime";
import { isLocale } from "@/i18n/config";
import { Link, redirect } from "@/i18n/navigation";
import { requireMemberPage } from "@/lib/auth/viewer";
import { cardUrl } from "@/lib/celebrities/photo";
import { displayInvitationStatus, type ChatInvitationStatus } from "@/lib/chat-invitations/status";
import { WithdrawButton } from "./WithdrawButton";

export async function generateMetadata() {
  const t = await getTranslations("invitations");
  return { title: t("title") };
}

const STATUS_STYLE: Record<ChatInvitationStatus, string> = {
  pending: "border-gold text-ink",
  approved: "border-primary text-primary",
  rejected: "border-accent text-accent",
  withdrawn: "border-border text-muted",
  expired: "border-border text-muted",
};

export default async function MyInvitationsPage() {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  const { supabase, viewer } = await requireMemberPage(locale);
  // Admins browse as fans do, but have no invitations of their own.
  if (viewer.role !== "fan") return redirect({ href: "/admin/chat-invitations", locale });
  const t = await getTranslations("invitations");

  const { data, error } = await supabase
    .from("chat_invitations")
    .select("id, status, message, reason, expires_at, created_at, decided_at, celebrity:celebrity_profiles(id, stage_name, photo_url), conversation:conversations(id)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`invitations query failed: ${error.code}`);
  const now = new Date();

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("intro")}</p>
      </div>

      {data.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-muted">
          {t.rich("empty", {
            link: (chunks) => (
              <Link href="/celebrities" className="text-primary underline underline-offset-4">
                {chunks}
              </Link>
            ),
          })}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {data.map((inv) => {
            const status = displayInvitationStatus(inv.status, inv.expires_at, now);
            const c = inv.celebrity;
            return (
              <li key={inv.id} className="flex gap-4 rounded-xl border border-border bg-surface p-4">
                <div className="aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-md border-2 border-gold bg-band sm:w-20">
                  {c?.photo_url && (
                    // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL
                    <img src={cardUrl(c.photo_url)} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {c && (
                      <Link href={`/celebrities/${c.id}`} className="font-heading text-lg font-semibold break-words hover:underline">
                        {c.stage_name}
                      </Link>
                    )}
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
                      {t(`status.${status}`)}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-line break-words">{inv.message}</p>
                  <p className="text-xs text-muted">
                    {t.rich("sentOn", { date: () => <LocalTime iso={inv.created_at} /> })}
                  </p>
                  {status === "pending" && <WithdrawButton invitationId={inv.id} />}
                  {status === "approved" && (
                    <p className="flex flex-wrap items-center gap-3 text-sm">
                      {t("approvedNote")}
                      {inv.conversation && (
                        <Link
                          href={`/chats/${inv.conversation.id}`}
                          className="rounded-full bg-primary px-3 py-1 font-medium text-primary-ink hover:opacity-90"
                        >
                          {t("openChat")}
                        </Link>
                      )}
                    </p>
                  )}
                  {status === "rejected" && inv.reason && (
                    <p className="text-sm">
                      {t("reasonLabel")} <span className="italic">{inv.reason}</span>
                    </p>
                  )}
                </div>
                {status === "approved" && <ApprovedSeal label={t("status.approved")} />}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
