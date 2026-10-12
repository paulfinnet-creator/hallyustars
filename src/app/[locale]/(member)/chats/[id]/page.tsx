import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requireChatPage } from "@/lib/auth/viewer";
import { PAGE_SIZE, toChatMessage } from "@/lib/chat/messages";
import { isTranslationConfigured } from "@/lib/translation/deepl";
import { ChatRoom } from "./ChatRoom";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata() {
  const t = await getTranslations("chat");
  return { title: t("listTitle") };
}

export default async function ConversationPage({ params }: PageProps<"/[locale]/chats/[id]">) {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  const { supabase, viewer } = await requireChatPage(locale);
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  // RLS: only members get a row back, so anyone else sees a 404.
  const { data: conversation, error } = await supabase
    .rpc("my_conversations")
    .eq("conversation_id", id)
    .maybeSingle();
  if (error) throw new Error(`conversation query failed: ${error.code}`);
  if (!conversation) notFound();

  const [{ data: rows, error: messagesError }, { data: otherMember }] = await Promise.all([
    supabase
      .from("messages")
      .select("id, sender_id, body, attachments, created_at, deleted_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE + 1),
    supabase
      .from("conversation_members")
      .select("last_read_at")
      .eq("conversation_id", id)
      .eq("user_id", conversation.other_id)
      .maybeSingle(),
  ]);
  if (messagesError) throw new Error(`messages query failed: ${messagesError.code}`);

  const hasMore = rows.length > PAGE_SIZE;
  const messages = rows.slice(0, PAGE_SIZE).reverse().map(toChatMessage);
  const ids = messages.map((m) => m.id);
  const [{ data: reactions }, { data: translations }, { data: myBlock }] = await Promise.all([
    ids.length
      ? supabase.from("reactions").select("message_id, user_id, emoji").in("message_id", ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase
          .from("message_translations")
          .select("message_id, body, detected_locale")
          .eq("locale", locale)
          .in("message_id", ids)
      : Promise.resolve({ data: [] }),
    // RLS: members only see blocks they made themselves.
    supabase.from("blocks").select("blocked_id").eq("blocked_id", conversation.other_id).maybeSingle(),
  ]);

  return (
    <ChatRoom
      conversationId={id}
      me={viewer.id}
      closed={conversation.closed_at !== null}
      other={{
        id: conversation.other_id,
        name: conversation.other_name,
        avatarUrl: conversation.other_avatar,
        verified: conversation.other_verified,
        timeZone: conversation.other_timezone,
        lastReadAt: otherMember?.last_read_at ?? null,
      }}
      initialMessages={messages}
      initialReactions={(reactions ?? []).map((r) => ({ messageId: r.message_id, userId: r.user_id, emoji: r.emoji }))}
      initialHasMore={hasMore}
      initialTranslations={Object.fromEntries(
        (translations ?? []).map((t) => [t.message_id, { text: t.body, same: t.detected_locale === locale }]),
      )}
      initialBlocked={Boolean(myBlock)}
      translationAvailable={isTranslationConfigured()}
    />
  );
}
