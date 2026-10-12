import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/LocalTime";
import { isLocale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { requireAdminPage } from "@/lib/auth/viewer";
import { toChatMessage } from "@/lib/chat/messages";
import {
  CloseConversationButton,
  RemoveMessageButton,
  ReportButtons,
  SuspendButton,
} from "../../ModerationButtons";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
const SIGNED_URL_SECONDS = 600;

export default async function ReviewConversationPage({
  params,
}: PageProps<"/[locale]/admin/moderation/conversations/[id]">) {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  const { supabase } = await requireAdminPage(locale);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const t = await getTranslations("admin.moderation");

  // Logged first; refused (→ 404) unless the conversation is under review.
  const { error: logError } = await supabase.rpc("admin_log_conversation_view", { p_conversation_id: id });
  if (logError) notFound();

  const [conversation, members, messages, reports] = await Promise.all([
    supabase.from("conversations").select("id, closed_at, created_at").eq("id", id).single(),
    supabase.from("conversation_members").select("user:users(id, display_name, role, status)").eq("conversation_id", id),
    supabase
      .from("messages")
      .select("id, sender_id, body, attachments, created_at, deleted_at, flag_reason")
      .eq("conversation_id", id)
      .order("created_at")
      .limit(1000),
    supabase
      .from("reports")
      .select("id, reason, status, resolution, created_at, message_id, reporter:users!reports_reporter_id_fkey(display_name), handler:users!reports_handled_by_fkey(display_name)")
      .eq("conversation_id", id)
      .order("created_at"),
  ]);
  for (const result of [conversation, members, messages, reports]) {
    if (result.error) throw new Error(`review query failed: ${result.error.code}`);
  }

  // Always "fan ↔ star".
  const people = members
    .data!.flatMap((m) => (m.user ? [m.user] : []))
    .sort((a, b) => (a.role === "fan" ? -1 : 0) - (b.role === "fan" ? -1 : 0));
  const nameOf = (userId: string) => people.find((p) => p.id === userId)?.display_name ?? "";
  const reportedMessages = new Set(reports.data!.flatMap((r) => (r.message_id ? [r.message_id] : [])));

  // Images: signed with the admin's own session (storage policy: under review only).
  const paths = messages.data!.flatMap((m) => toChatMessage({ ...m, deleted_at: null }).attachments.map((a) => a.path));
  const { data: signed } = paths.length
    ? await supabase.storage.from("chat-images").createSignedUrls(paths, SIGNED_URL_SECONDS)
    : { data: [] };
  const urlOf = new Map((signed ?? []).flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])));

  const closed = conversation.data!.closed_at !== null;

  return (
    <main className="flex flex-col gap-6">
      <Link href="/admin/moderation" className="self-start text-sm text-primary underline underline-offset-4">
        {t("backToQueue")}
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">{people.map((p) => p.display_name).join(" ↔ ")}</h1>
        <p className="text-sm text-muted">{t("viewLogged")}</p>
      </div>

      <section aria-labelledby="people-title" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <h2 id="people-title" className="text-lg font-semibold">
          {t("people")}
        </h2>
        <ul className="flex flex-col gap-3">
          {people.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3">
              <span className="font-medium">{p.display_name}</span>
              <span className="text-sm text-muted">
                {t(`roles.${p.role}`)} · {t(`statuses.${p.status === "suspended" ? "suspended" : "active"}`)}
              </span>
              {p.role !== "admin" && (p.status === "approved" || p.status === "suspended") && (
                <SuspendButton userId={p.id} name={p.display_name} suspended={p.status === "suspended"} />
              )}
            </li>
          ))}
        </ul>
        {closed ? (
          <p className="text-sm text-muted">
            {t.rich("closedOn", { date: () => <LocalTime iso={conversation.data!.closed_at!} options={DATE_TIME} /> })}
          </p>
        ) : (
          <div>
            <CloseConversationButton conversationId={id} />
          </div>
        )}
      </section>

      <section aria-labelledby="reports-title" className="flex flex-col gap-3">
        <h2 id="reports-title" className="text-lg font-semibold">
          {t("reportsHere")}
        </h2>
        {reports.data!.length === 0 ? (
          <p className="text-sm text-muted">{t("noReportsHere")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {reports.data!.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
                <p className="text-sm">
                  <span className="font-medium">{t("reportedBy", { name: r.reporter?.display_name ?? "" })}</span>
                  {" · "}
                  <LocalTime iso={r.created_at} options={DATE_TIME} />
                  {" · "}
                  <span className={r.status === "open" ? "text-accent" : "text-muted"}>{t(`reportStatus.${r.status}`)}</span>
                </p>
                <blockquote className="border-s-2 border-accent ps-3 text-sm whitespace-pre-line break-words">{r.reason}</blockquote>
                {r.status === "open" ? (
                  <ReportButtons reportId={r.id} />
                ) : (
                  <p className="text-xs text-muted">
                    {t("handledBy", { name: r.handler?.display_name ?? "" })}
                    {r.resolution && ` · ${r.resolution}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="messages-title" className="flex flex-col gap-3">
        <h2 id="messages-title" className="text-lg font-semibold">
          {t("messages")}
        </h2>
        <ol className="flex flex-col gap-2">
          {messages.data!.map((m) => {
            const message = toChatMessage({ ...m, deleted_at: null });
            const removed = m.deleted_at !== null;
            return (
              <li
                key={m.id}
                className={`flex flex-col gap-1.5 rounded-xl border p-3 ${
                  reportedMessages.has(m.id) ? "border-accent bg-accent/5" : "border-border bg-surface"
                }`}
              >
                <p className="text-xs text-muted">
                  <span className="font-medium text-ink">{nameOf(m.sender_id)}</span> ·{" "}
                  <LocalTime iso={m.created_at} options={DATE_TIME} />
                  {reportedMessages.has(m.id) && <span className="text-accent"> · {t("reportedMessage")}</span>}
                  {removed && (
                    <span className="text-accent">
                      {" "}
                      · {t("removed")}
                      {m.flag_reason && `: ${m.flag_reason}`}
                    </span>
                  )}
                </p>
                {message.attachments.map((a) =>
                  urlOf.get(a.path) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                    <img key={a.path} src={urlOf.get(a.path)} alt={t("photoFrom", { name: nameOf(m.sender_id) })} className="max-h-60 w-auto self-start rounded-lg" />
                  ) : null,
                )}
                {message.body && <p className={`whitespace-pre-wrap break-words ${removed ? "text-muted line-through" : ""}`}>{message.body}</p>}
                {!removed && (
                  <div>
                    <RemoveMessageButton messageId={m.id} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}
