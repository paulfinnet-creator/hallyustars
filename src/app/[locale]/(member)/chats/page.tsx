import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { VerifiedBadge } from "@/components/CelebrityCard";
import { RelativeTime } from "@/components/RelativeTime";
import { isLocale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { requireChatPage } from "@/lib/auth/viewer";
import { ChatListLive } from "./ChatListLive";

export async function generateMetadata() {
  const t = await getTranslations("chat");
  return { title: t("listTitle") };
}

export default async function ChatsPage() {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  const { supabase, viewer } = await requireChatPage(locale);
  const t = await getTranslations("chat");

  const { data, error } = await supabase.rpc("my_conversations");
  if (error) throw new Error(`conversations query failed: ${error.code}`);

  return (
    <main className="flex flex-col gap-6">
      <ChatListLive />
      <h1 className="text-3xl font-semibold">{t("listTitle")}</h1>

      {data.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-muted">
          {viewer.role === "fan"
            ? t.rich("emptyFan", {
                link: (chunks) => (
                  <Link href="/celebrities" className="text-primary underline underline-offset-4">
                    {chunks}
                  </Link>
                ),
              })
            : t("emptyCelebrity")}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {data.map((c) => {
            const preview = c.last_has_image
              ? t("photoPreview")
              : (c.last_body ?? (c.last_at ? t("deletedPreview") : t("noMessagesYet")));
            const mine = c.last_sender === viewer.id;
            return (
              <li key={c.conversation_id}>
                <Link
                  href={`/chats/${c.conversation_id}`}
                  className="flex items-center gap-3 p-4 hover:bg-band focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                >
                  <span className="size-12 shrink-0 overflow-hidden rounded-full border border-border bg-band">
                    {c.other_avatar && (
                      // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL
                      <img src={c.other_avatar} alt="" className="h-full w-full object-cover" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5 font-medium">
                      <span className="truncate">{c.other_name}</span>
                      {c.other_verified && <VerifiedBadge label={t("verified")} className="size-4" />}
                    </span>
                    <span className={`truncate text-sm ${c.unread > 0 ? "font-medium text-ink" : "text-muted"}`}>
                      {mine && t("youPrefix")} {preview}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {c.last_at && (
                      <span className="text-xs text-muted">
                        <RelativeTime iso={c.last_at} />
                      </span>
                    )}
                    {c.unread > 0 && (
                      <span className="rounded-full bg-accent px-2 text-xs font-medium text-white">
                        <span aria-hidden="true">{c.unread}</span>
                        <span className="sr-only">{t("unread", { count: c.unread })}</span>
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
