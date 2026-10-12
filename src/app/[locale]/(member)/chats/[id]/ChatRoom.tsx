"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useLocale, useTranslations } from "next-intl";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { VerifiedBadge } from "@/components/CelebrityCard";
import { RelativeTime } from "@/components/RelativeTime";
import { ErrorMessage } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import {
  lastSeenMessageId,
  MESSAGE_MAX,
  mergeMessages,
  PAGE_SIZE,
  placeFromTimeZone,
  REACTIONS,
  summarizeReactions,
  toChatMessage,
  type ChatMessage,
  type Reaction,
} from "@/lib/chat/messages";
import { ACCEPT_ATTRIBUTE, MAX_SIDE, MAX_UPLOAD_BYTES, photoKind } from "@/lib/images/rules";
import { resizedJpeg, uploadWithTicket } from "@/lib/images/upload";
import { createClient } from "@/lib/supabase/client";
import { dayDividerLabel, formatTime, isSameDay } from "@/lib/time/format";
import { useNow } from "@/lib/time/useNow";
import {
  chatImageTicket,
  finishChatImage,
  notifyNewMessage,
  translateMessages,
  type ChatImageError,
  type MessageTranslation,
} from "./actions";
import { BlockDialog, ReportDialog, SafetyMenu } from "./SafetyControls";

type Other = {
  id: string;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
  timeZone: string;
  lastReadAt: string | null;
};

type ChatError =
  | "cannotPost"
  | "tooLong"
  | "wrongType"
  | "tooLarge"
  | ChatImageError;

const SELECT = "id, sender_id, body, attachments, created_at, deleted_at";
const TYPING_SEND_EVERY_MS = 2_000;
const TYPING_SHOW_MS = 4_000;
const SIGNED_URL_SECONDS = 3_600;
const TRANSLATE_BATCH = 50;
const AUTO_TRANSLATE_KEY = "hs-chat-auto-translate";

type Translation = Omit<MessageTranslation, "id">;

/**
 * The reader's "translate messages" choice: a per-device convenience saved in
 * localStorage, on by default, read as an external store so it survives reloads.
 */
const autoTranslateListeners = new Set<() => void>();
/** Fallback when storage is blocked (private mode): the choice lasts for this visit. */
let autoTranslateInMemory: boolean | null = null;
const autoTranslateStore = {
  subscribe(listener: () => void) {
    autoTranslateListeners.add(listener);
    return () => autoTranslateListeners.delete(listener);
  },
  get(): boolean {
    if (autoTranslateInMemory !== null) return autoTranslateInMemory;
    try {
      return localStorage.getItem(AUTO_TRANSLATE_KEY) !== "off";
    } catch {
      return true;
    }
  },
  set(on: boolean) {
    autoTranslateInMemory = on;
    try {
      localStorage.setItem(AUTO_TRANSLATE_KEY, on ? "on" : "off");
    } catch {
      // Private mode: kept in memory only.
    }
    autoTranslateListeners.forEach((listener) => listener());
  },
};

/** True after hydration: device-timezone rendering waits for it (the server can't know the zone). */
const noopSubscribe = () => () => {};
function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export function ChatRoom({
  conversationId,
  me,
  closed,
  other,
  initialMessages,
  initialReactions,
  initialHasMore,
  initialTranslations,
  initialBlocked,
  translationAvailable,
}: {
  conversationId: string;
  me: string;
  closed: boolean;
  other: Other;
  initialMessages: ChatMessage[];
  initialReactions: Reaction[];
  initialHasMore: boolean;
  initialTranslations: Record<string, Translation>;
  /** Whether I have blocked the other person. */
  initialBlocked: boolean;
  translationAvailable: boolean;
}) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const supabase = useMemo(() => createClient(), []);

  const [messages, setMessages] = useState(initialMessages);
  const [reactions, setReactions] = useState(initialReactions);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [otherLastReadAt, setOtherLastReadAt] = useState(other.lastReadAt);
  const [otherPresent, setOtherPresent] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [translations, setTranslations] = useState(initialTranslations);
  const [showingOriginal, setShowingOriginal] = useState<ReadonlySet<string>>(new Set());
  const autoTranslate = useSyncExternalStore(autoTranslateStore.subscribe, autoTranslateStore.get, () => true);
  const [blocked, setBlocked] = useState(initialBlocked);
  const [dialog, setDialog] = useState<{ kind: "report"; messageId: string | null } | { kind: "block" } | null>(null);
  const translating = useRef(new Set<string>());

  const channelRef = useRef<RealtimeChannel | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastTypingSent = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stickToBottom = useRef(true);
  const messagesRef = useRef(messages);
  const prependAnchor = useRef<number | null>(null);

  // ── Read receipts ──
  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    // Query builders only run once awaited or then()-ed.
    void supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId }).then();
  }, [supabase, conversationId]);

  useEffect(() => {
    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [markRead]);

  // ── Realtime: new messages, read times, typing, presence, reactions ──
  const refetchReactions = useCallback(
    async (messageId: string) => {
      const { data } = await supabase.from("reactions").select("message_id, user_id, emoji").eq("message_id", messageId);
      if (!data) return;
      setReactions((list) => [
        ...list.filter((r) => r.messageId !== messageId),
        ...data.map((r) => ({ messageId: r.message_id, userId: r.user_id, emoji: r.emoji })),
      ]);
    },
    [supabase],
  );

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const catchUp = useCallback(async () => {
    const latest = messagesRef.current.at(-1);
    let query = supabase.from("messages").select(SELECT).eq("conversation_id", conversationId);
    if (latest) query = query.gt("created_at", latest.createdAt);
    const { data } = await query.order("created_at").limit(PAGE_SIZE);
    if (data?.length) {
      setMessages((list) => mergeMessages(list, data.map(toChatMessage)));
      markRead();
    }
  }, [supabase, conversationId, markRead]);

  useEffect(() => {
    let cancelled = false;
    // Database changes: RLS decides per subscriber which rows they may see.
    // (Private channels don't carry postgres_changes, so this one is separate.)
    const changes = supabase.channel(`changes:conversation:${conversationId}`);
    // Typing, presence and reaction pings: a private channel only the two
    // members may join (policies on realtime.messages).
    const channel = supabase.channel(`conversation:${conversationId}`, {
      config: { private: true, presence: { key: me } },
    });
    channelRef.current = channel;

    changes
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const message = toChatMessage(payload.new as Parameters<typeof toChatMessage>[0]);
          setMessages((list) => mergeMessages(list, [message]));
          if (message.senderId !== me) {
            setOtherTyping(false);
            markRead();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const message = toChatMessage(payload.new as Parameters<typeof toChatMessage>[0]);
          setMessages((list) => (list.some((m) => m.id === message.id) ? mergeMessages(list, [message]) : list));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_members",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as { user_id: string; last_read_at: string | null };
          if (row.user_id === other.id) setOtherLastReadAt(row.last_read_at);
        },
      );

    channel
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if ((payload as { userId?: string }).userId !== other.id) return;
        setOtherTyping(true);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setOtherTyping(false), TYPING_SHOW_MS);
      })
      .on("broadcast", { event: "reactions" }, ({ payload }) => {
        const messageId = (payload as { messageId?: string }).messageId;
        if (messageId) void refetchReactions(messageId);
      })
      .on("presence", { event: "sync" }, () => {
        setOtherPresent(other.id in channel.presenceState());
      });

    // Both channels authorize with the member's own token.
    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return;
      changes.subscribe((status) => {
        // Catch up on anything sent between the page load (or a dropped
        // connection) and the subscription becoming live.
        if (status === "SUBSCRIBED") void catchUp();
      });
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ online: true });
      });
    });

    return () => {
      cancelled = true;
      if (typingTimer.current) clearTimeout(typingTimer.current);
      channelRef.current = null;
      void supabase.removeChannel(changes);
      void supabase.removeChannel(channel);
    };
  }, [supabase, conversationId, me, other.id, markRead, refetchReactions, catchUp]);

  // ── Translation: the other person's messages, in my site language ──
  function toggleAutoTranslate() {
    autoTranslateStore.set(!autoTranslate);
  }

  useEffect(() => {
    if (!translationAvailable || !autoTranslate) return;
    const wanted = messages
      .filter((m) => m.senderId !== me && !m.deleted && m.body.trim())
      .map((m) => m.id)
      .filter((id) => !(id in translations) && !translating.current.has(id))
      .slice(-TRANSLATE_BATCH);
    if (!wanted.length) return;
    for (const id of wanted) translating.current.add(id);
    void translateMessages({ conversationId, locale, messageIds: wanted }).then((result) => {
      if ("error" in result) return; // Originals stay visible; nothing else to do.
      setTranslations((current) => ({
        ...current,
        ...Object.fromEntries(result.translations.map(({ id, ...t }) => [id, t])),
      }));
    });
  }, [messages, translations, autoTranslate, translationAvailable, conversationId, locale, me]);

  function toggleOriginal(messageId: string) {
    setShowingOriginal((current) => {
      const next = new Set(current);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }

  async function unblock() {
    const { error: deleteError } = await supabase.from("blocks").delete().match({ blocker_id: me, blocked_id: other.id });
    if (deleteError) return setError("failed");
    setBlocked(false);
  }

  // ── Signed URLs for images (private bucket, members only) ──
  useEffect(() => {
    const missing = [
      ...new Set(messages.flatMap((m) => m.attachments.map((a) => a.path)).filter((p) => !(p in imageUrls))),
    ];
    if (!missing.length) return;
    void supabase.storage
      .from("chat-images")
      .createSignedUrls(missing, SIGNED_URL_SECONDS)
      .then(({ data }) => {
        if (!data) return;
        setImageUrls((urls) => ({
          ...urls,
          ...Object.fromEntries(
            data.flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl] as const] : [])),
          ),
        }));
      });
  }, [messages, imageUrls, supabase]);

  // ── Scrolling: start at the bottom, follow new messages, keep place when loading older ──
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (prependAnchor.current !== null) {
      list.scrollTop = list.scrollHeight - prependAnchor.current;
      prependAnchor.current = null;
    } else if (stickToBottom.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, otherTyping]);

  function onScroll() {
    const list = listRef.current;
    if (list) stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  }

  async function loadEarlier() {
    const oldest = messages[0];
    if (!oldest) return;
    const { data } = await supabase
      .from("messages")
      .select(SELECT)
      .eq("conversation_id", conversationId)
      .lt("created_at", oldest.createdAt)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE + 1);
    if (!data) return;
    const older = data.slice(0, PAGE_SIZE).map(toChatMessage);
    if (older.length) {
      const { data: more } = await supabase
        .from("reactions")
        .select("message_id, user_id, emoji")
        .in(
          "message_id",
          older.map((m) => m.id),
        );
      setReactions((list) => [
        ...list,
        ...(more ?? []).map((r) => ({ messageId: r.message_id, userId: r.user_id, emoji: r.emoji })),
      ]);
    }
    prependAnchor.current = listRef.current ? listRef.current.scrollHeight - listRef.current.scrollTop : null;
    setHasMore(data.length > PAGE_SIZE);
    setMessages((list) => mergeMessages(list, older));
  }

  // ── Sending ──
  function onDraftChange(value: string) {
    setDraft(value);
    const now = Date.now();
    if (value.trim() && now - lastTypingSent.current > TYPING_SEND_EVERY_MS) {
      lastTypingSent.current = now;
      void channelRef.current?.send({ type: "broadcast", event: "typing", payload: { userId: me } });
    }
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    if (body.length > MESSAGE_MAX) return setError("tooLong");
    setSending(true);
    setError(null);
    setDraft("");
    stickToBottom.current = true;
    const { data, error: sendError } = await supabase.rpc("send_message", {
      p_conversation_id: conversationId,
      p_body: body,
    });
    setSending(false);
    if (sendError) {
      setDraft(body);
      setError(sendError.code === "42501" ? "cannotPost" : sendError.code === "23514" ? "tooLong" : "failed");
      return;
    }
    const result = data as { message?: Parameters<typeof toChatMessage>[0] };
    lastTypingSent.current = 0;
    if (result.message) setMessages((list) => mergeMessages(list, [toChatMessage(result.message!)]));
    notifyOther();
  }

  /** Email the other person later, unless they are in this chat right now. */
  function notifyOther() {
    if (!otherPresent) void notifyNewMessage({ conversationId });
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  async function sendPhoto(file: File) {
    setError(null);
    const kind = photoKind(file);
    if (!kind) return setError("wrongType");
    if (file.size > MAX_UPLOAD_BYTES) return setError("tooLarge");
    setPhotoBusy(true);
    stickToBottom.current = true;
    try {
      const blob = kind === "heic" ? file : await resizedJpeg(file, MAX_SIDE);
      const uploaded = await uploadWithTicket(
        blob,
        kind === "heic" ? "heic" : "jpg",
        (input) => chatImageTicket({ conversationId, ...input }),
        "chat-images",
      );
      if ("error" in uploaded) return setError(uploaded.error);
      const result = await finishChatImage({ conversationId, rawPath: uploaded.path });
      if ("error" in result) return setError(result.error);
      setMessages((list) => mergeMessages(list, [result.message]));
      notifyOther();
    } catch {
      setError("unreadable");
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // ── Reactions ──
  async function toggleReaction(messageId: string, emoji: string) {
    setPickerFor(null);
    const mine = reactions.some((r) => r.messageId === messageId && r.userId === me && r.emoji === emoji);
    const { error: reactionError } = mine
      ? await supabase.from("reactions").delete().match({ message_id: messageId, user_id: me, emoji })
      : await supabase.from("reactions").insert({ message_id: messageId, emoji });
    if (reactionError) return setError(reactionError.code === "42501" ? "cannotPost" : "failed");
    setReactions((list) =>
      mine
        ? list.filter((r) => !(r.messageId === messageId && r.userId === me && r.emoji === emoji))
        : [...list, { messageId, userId: me, emoji }],
    );
    void channelRef.current?.send({ type: "broadcast", event: "reactions", payload: { messageId } });
  }

  const seenId = lastSeenMessageId(messages, me, otherLastReadAt);
  const now = useNow();
  const hydrated = useHydrated();
  // Before hydration both renders group days in UTC, so they match.
  const dayZone = hydrated ? undefined : "UTC";

  return (
    <main className="flex h-[calc(100dvh-9rem)] min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      {/* Header: who, their local time, presence */}
      <header className="flex items-center gap-3 border-b border-border bg-band px-4 py-3">
        <Link
          href="/chats"
          className="rounded-full px-2 py-1 text-sm text-primary hover:bg-surface"
          aria-label={t("backToChats")}
        >
          <span aria-hidden="true" className="inline-block rtl:-scale-x-100">
            ←
          </span>
        </Link>
        <span className="size-10 shrink-0 overflow-hidden rounded-full border border-border bg-surface">
          {other.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL
            <img src={other.avatarUrl} alt="" className="h-full w-full object-cover" />
          )}
        </span>
        <div className="flex min-w-0 flex-col">
          <h1 className="flex items-center gap-1.5 text-lg font-semibold">
            <span className="truncate">{other.name}</span>
            {other.verified && <VerifiedBadge label={t("verified")} className="size-4" />}
          </h1>
          <p className="truncate text-xs text-muted">
            <LocalNow timeZone={other.timeZone} now={now} />
            {otherPresent && (
              <>
                {" · "}
                <span className="font-medium text-primary">{t("inChat")}</span>
              </>
            )}
          </p>
        </div>
        <div className="ms-auto flex items-center gap-1">
          {translationAvailable && (
            <button
              type="button"
              aria-pressed={autoTranslate}
              onClick={toggleAutoTranslate}
              title={t("translateToggle")}
              className="flex h-9 items-center gap-1 rounded-full border border-border px-2.5 text-xs font-medium text-muted hover:bg-surface aria-pressed:border-primary aria-pressed:text-primary"
            >
              <span aria-hidden="true">文A</span>
              <span className="sr-only sm:not-sr-only">{t("translateToggle")}</span>
            </button>
          )}
          <SafetyMenu
            name={other.name}
            blocked={blocked}
            onReport={() => setDialog({ kind: "report", messageId: null })}
            onBlock={() => setDialog({ kind: "block" })}
            onUnblock={() => void unblock()}
          />
        </div>
      </header>

      {/* Messages */}
      <div
        ref={listRef}
        onScroll={onScroll}
        role="log"
        aria-label={t("messagesLabel", { name: other.name })}
        className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4 sm:px-6"
      >
        {hasMore ? (
          <button
            type="button"
            onClick={() => void loadEarlier()}
            className="mb-2 self-center rounded-full border border-border bg-surface px-3 py-1 text-sm text-ink hover:bg-band"
          >
            {t("loadEarlier")}
          </button>
        ) : (
          <p className="mb-2 text-center text-sm text-muted">{t("startOfChat", { name: other.name })}</p>
        )}

        {messages.map((m, i) => {
          const previous = messages[i - 1];
          const newDay = !previous || !isSameDay(new Date(previous.createdAt), new Date(m.createdAt), dayZone);
          const mine = m.senderId === me;
          const summary = summarizeReactions(reactions, m.id, me);
          return (
            <Fragment key={m.id}>
              {newDay && (
                <div role="separator" className="my-3 flex items-center gap-3 text-xs text-muted">
                  <span className="h-px flex-1 bg-border" />
                  <DayLabel iso={m.createdAt} locale={locale} now={now} />
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              <div className={`group flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 break-words whitespace-pre-wrap sm:max-w-[70%] ${
                    m.deleted
                      ? "border border-dashed border-border text-muted italic"
                      : mine
                        ? "rounded-ee-sm bg-primary text-primary-ink"
                        : other.verified
                          ? "rounded-es-sm border border-primary/30 bg-primary/10 text-ink dark:border-violet-400/70 dark:bg-surface"
                          : "rounded-es-sm border border-border bg-band text-ink"
                  }`}
                >
                  {m.deleted ? (
                    t("removedMessage")
                  ) : (
                    <>
                      {m.attachments.map((a) =>
                        imageUrls[a.path] ? (
                          <a key={a.path} href={imageUrls[a.path]} target="_blank" rel="noopener noreferrer" className="block">
                            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                            <img
                              src={imageUrls[a.path]}
                              alt={mine ? t("photoAltMine") : t("photoAlt", { name: other.name })}
                              width={a.width}
                              height={a.height}
                              className="max-h-80 w-auto rounded-lg"
                            />
                          </a>
                        ) : (
                          <span
                            key={a.path}
                            className="block animate-pulse rounded-lg bg-border"
                            style={{ aspectRatio: `${a.width} / ${a.height}`, width: "min(16rem, 60vw)" }}
                          />
                        ),
                      )}
                      <MessageText
                        body={m.body}
                        translation={!mine && autoTranslate ? translations[m.id] : undefined}
                        original={showingOriginal.has(m.id)}
                      />
                    </>
                  )}
                </div>

                {summary.length > 0 && (
                  <div className="-mt-1.5 flex flex-wrap gap-1 px-2">
                    {summary.map((r) => (
                      <button
                        key={r.emoji}
                        type="button"
                        aria-pressed={r.byMe}
                        aria-label={t("reactionCount", { emoji: r.emoji, count: r.count })}
                        disabled={closed}
                        onClick={() => void toggleReaction(m.id, r.emoji)}
                        className="rounded-full border border-border bg-surface px-1.5 text-xs shadow-sm aria-pressed:border-primary aria-pressed:bg-primary/10"
                      >
                        {r.emoji} {r.count}
                      </button>
                    ))}
                  </div>
                )}

                <div className={`flex items-center gap-2 px-1 text-[0.7rem] text-muted ${mine ? "flex-row-reverse" : ""}`}>
                  {!mine && other.verified && <VerifiedBadge label={t("verified")} className="size-3" />}
                  <RelativeTime iso={m.createdAt} />
                  {mine && m.id === seenId && <span className="font-medium">{t("seen")}</span>}
                  {!mine && autoTranslate && translations[m.id] && !translations[m.id]!.same && !m.deleted && (
                    <button
                      type="button"
                      onClick={() => toggleOriginal(m.id)}
                      className="rounded-full px-1 underline underline-offset-2 hover:text-ink"
                    >
                      {showingOriginal.has(m.id) ? t("showTranslation") : t("viewOriginal")}
                    </button>
                  )}
                  {!mine && !m.deleted && (
                    <button
                      type="button"
                      aria-label={t("safety.reportMessage")}
                      onClick={() => setDialog({ kind: "report", messageId: m.id })}
                      className="rounded-full px-1 opacity-60 hover:bg-band hover:opacity-100 focus-visible:opacity-100"
                    >
                      <span aria-hidden="true">⚑</span>
                    </button>
                  )}
                  {!m.deleted && !closed && (
                    <span className="relative">
                      <button
                        type="button"
                        aria-label={t("react")}
                        aria-expanded={pickerFor === m.id}
                        onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}
                        className="rounded-full px-1 opacity-60 hover:bg-band hover:opacity-100 focus-visible:opacity-100"
                      >
                        <span aria-hidden="true">☺</span>
                      </button>
                      {pickerFor === m.id && (
                        <span
                          role="group"
                          aria-label={t("react")}
                          className={`absolute bottom-6 z-10 flex gap-1 rounded-full border border-border bg-surface p-1 shadow-md ${
                            mine ? "end-0" : "start-0"
                          }`}
                        >
                          {REACTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => void toggleReaction(m.id, emoji)}
                              className="rounded-full px-1 text-lg hover:bg-band"
                            >
                              {emoji}
                            </button>
                          ))}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </Fragment>
          );
        })}

        {otherTyping && (
          <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted" aria-live="polite">
            <span className="flex gap-1" aria-hidden="true">
              <span className="hs-lightstick size-2 rounded-full bg-primary" />
              <span className="hs-lightstick size-2 rounded-full bg-primary [animation-delay:150ms]" />
              <span className="hs-lightstick size-2 rounded-full bg-primary [animation-delay:300ms]" />
            </span>
            {t("typing", { name: other.name })}
          </div>
        )}
      </div>

      {/* Composer */}
      {closed ? (
        <p className="border-t border-border bg-band px-4 py-3 text-sm text-muted">{t("closed")}</p>
      ) : blocked ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-border bg-band px-4 py-3 text-sm">
          <span className="text-muted">{t("safety.youBlocked", { name: other.name })}</span>
          <button type="button" onClick={() => void unblock()} className="text-primary underline underline-offset-4">
            {t("safety.unblock", { name: other.name })}
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void send(e)} className="flex flex-col gap-2 border-t border-border bg-band p-3">
          <ErrorMessage>{error ? t(`errors.${error}`) : null}</ErrorMessage>
          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              className="sr-only"
              id="chat-photo"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void sendPhoto(file);
              }}
            />
            <label
              htmlFor="chat-photo"
              aria-disabled={photoBusy}
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-lg hover:bg-band aria-disabled:pointer-events-none aria-disabled:opacity-60"
            >
              <span aria-hidden="true">📷</span>
              <span className="sr-only">{t("attachPhoto")}</span>
            </label>
            <label htmlFor="chat-message" className="sr-only">
              {t("messageLabel")}
            </label>
            <textarea
              id="chat-message"
              rows={1}
              maxLength={MESSAGE_MAX}
              value={draft}
              placeholder={t("messagePlaceholder")}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={onComposerKeyDown}
              className="max-h-40 min-h-10 flex-1 resize-y rounded-2xl border border-border bg-surface px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="h-10 shrink-0 rounded-full bg-primary px-4 text-sm font-medium text-primary-ink hover:opacity-90 disabled:opacity-60"
            >
              {t("send")}
            </button>
          </div>
          {photoBusy && (
            <p role="status" className="text-xs text-muted">
              {t("sendingPhoto")}
            </p>
          )}
        </form>
      )}

      {dialog?.kind === "report" && (
        <ReportDialog conversationId={conversationId} messageId={dialog.messageId} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "block" && (
        <BlockDialog
          otherId={other.id}
          name={other.name}
          onBlocked={() => setBlocked(true)}
          onClose={() => setDialog(null)}
        />
      )}
    </main>
  );
}

/** A message's text: the translation when there is one (and it differs), else the original. */
function MessageText({
  body,
  translation,
  original,
}: {
  body: string;
  translation: Translation | undefined;
  original: boolean;
}) {
  const t = useTranslations("chat");
  if (!translation || translation.same || original) return <>{body}</>;
  return (
    <>
      <span className="sr-only">{t("translatedLabel")} </span>
      {translation.text}
    </>
  );
}

/** "It's 11:40 PM in Seoul": the other person's local time, from their saved timezone. */
function LocalNow({ timeZone, now }: { timeZone: string; now: Date }) {
  const t = useTranslations("chat");
  const locale = useLocale();
  if (!useHydrated()) return <span> </span>;
  return <span>{t("localTime", { time: formatTime(now, locale, timeZone), place: placeFromTimeZone(timeZone) })}</span>;
}

/** Date divider in the viewer's device timezone ("Today", "Yesterday", weekday + date). */
function DayLabel({ iso, locale, now }: { iso: string; locale: string; now: Date }) {
  return <span>{useHydrated() ? dayDividerLabel(iso, locale, now) : " "}</span>;
}
