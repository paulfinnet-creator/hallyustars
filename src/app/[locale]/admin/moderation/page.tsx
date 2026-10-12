import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { LocalTime } from "@/components/LocalTime";
import { isLocale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { requireAdminPage } from "@/lib/auth/viewer";

const DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function ModerationPage() {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  const { supabase } = await requireAdminPage(locale);
  const t = await getTranslations("admin.moderation");

  // No message text on this page: it is only shown (and logged) on the review page.
  const [reports, blocks] = await Promise.all([
    supabase
      .from("reports")
      .select("id, reason, created_at, message_id, conversation_id, reporter:users!reports_reporter_id_fkey(display_name)")
      .eq("status", "open")
      .order("created_at")
      .limit(100),
    supabase
      .from("blocks")
      .select("created_at, blocker:users!blocks_blocker_id_fkey(display_name), blocked:users!blocks_blocked_id_fkey(display_name)")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  for (const result of [reports, blocks]) {
    if (result.error) throw new Error(`moderation query failed: ${result.error.code}`);
  }

  const conversationIds = [...new Set(reports.data!.map((r) => r.conversation_id))];
  const { data: members } = conversationIds.length
    ? await supabase
        .from("conversation_members")
        .select("conversation_id, user:users(display_name, role)")
        .in("conversation_id", conversationIds)
    : { data: [] };
  const people = (conversationId: string) =>
    (members ?? [])
      .filter((m) => m.conversation_id === conversationId)
      // Always "fan ↔ star".
      .sort((a, b) => (a.user?.role === "fan" ? -1 : 0) - (b.user?.role === "fan" ? -1 : 0))
      .map((m) => m.user?.display_name ?? "")
      .join(" ↔ ");
  const review = (conversationId: string) => (
    // No prefetch: opening a conversation is logged.
    <Link
      href={`/admin/moderation/conversations/${conversationId}`}
      prefetch={false}
      className="self-start rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink hover:opacity-90"
    >
      {t("review")}
    </Link>
  );

  const card = "flex flex-col gap-2 rounded-xl border border-border bg-surface p-4";

  return (
    <main className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("intro")}</p>
      </div>

      <Section id="reports-title" title={t("openReports", { count: reports.data!.length })}>
        {reports.data!.length === 0 ? (
          <p className="text-muted">{t("noReports")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {reports.data!.map((r) => (
              <li key={r.id} className={card}>
                <p className="font-medium">{people(r.conversation_id)}</p>
                <p className="text-sm">
                  <span className="text-muted">{t("reportedBy", { name: r.reporter?.display_name ?? "" })}</span>{" "}
                  {r.message_id ? t("aboutMessage") : t("aboutChat")}
                </p>
                <blockquote className="border-s-2 border-accent ps-3 text-sm whitespace-pre-line break-words">{r.reason}</blockquote>
                <p className="text-xs text-muted">
                  <LocalTime iso={r.created_at} options={DATE_TIME} />
                </p>
                {review(r.conversation_id)}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="blocks-title" title={t("memberBlocks")}>
        {blocks.data!.length === 0 ? (
          <p className="text-muted">{t("noBlocks")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
            {blocks.data!.map((b, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
                <span>{t("blocked", { blocker: b.blocker?.display_name ?? "", blocked: b.blocked?.display_name ?? "" })}</span>
                <span className="text-xs text-muted">
                  <LocalTime iso={b.created_at} options={DATE_TIME} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}
