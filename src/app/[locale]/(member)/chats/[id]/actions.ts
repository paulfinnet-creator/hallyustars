"use server";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { isLocale } from "@/i18n/config";
import { getViewer } from "@/lib/auth/viewer";
import { toChatMessage, type ChatMessage } from "@/lib/chat/messages";
import { toCleanJpeg, UnreadableImageError } from "@/lib/images/process";
import { queueChatEmails } from "@/lib/notifications/chat";
import { withinRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTranslationConfigured, translateMany } from "@/lib/translation/deepl";

/**
 * Chat images: the browser uploads the original straight to storage with a
 * signed URL (raw-<uuid>.<ext>), then finishChatImage cleans it (HEIC → JPG,
 * metadata stripped, ≤2000 px), stores <uuid>.jpg and posts the message.
 */

const BUCKET = "chat-images";
/** Images a member may send per hour, across chats. */
const HOURLY_LIMIT = 30;

export type ChatImageError = "unreadable" | "rateLimited" | "forbidden" | "failed";

const ticketSchema = z.object({ conversationId: z.uuid(), format: z.enum(["jpg", "heic"]) });

async function member(conversationId: string) {
  const { supabase, viewer } = await getViewer();
  if (!viewer || (viewer.role !== "fan" && viewer.role !== "celebrity") || viewer.status !== "approved") return null;
  // RLS: only members can see the conversation's member rows.
  const { data } = await supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", viewer.id)
    .maybeSingle();
  return data ? { supabase, viewer } : null;
}

export async function chatImageTicket(input: {
  conversationId: string;
  format: "jpg" | "heic";
}): Promise<{ path: string; token: string } | { error: ChatImageError }> {
  const parsed = ticketSchema.safeParse(input);
  if (!parsed.success) return { error: "failed" };
  const m = await member(parsed.data.conversationId);
  if (!m) return { error: "forbidden" };
  if (!(await withinRateLimit(`chat-image:${m.viewer.id}`, HOURLY_LIMIT, 3600))) return { error: "rateLimited" };

  const path = `${parsed.data.conversationId}/raw-${randomUUID()}.${parsed.data.format}`;
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) {
    console.error("chat image upload URL failed", error.name);
    return { error: "failed" };
  }
  return { path, token: data.token };
}

const finishSchema = z.object({ conversationId: z.uuid(), rawPath: z.string().max(200) });

export async function finishChatImage(input: {
  conversationId: string;
  rawPath: string;
}): Promise<{ message: ChatMessage } | { error: ChatImageError }> {
  const parsed = finishSchema.safeParse(input);
  if (!parsed.success) return { error: "failed" };
  const { conversationId, rawPath } = parsed.data;
  if (!new RegExp(`^${conversationId}/raw-[0-9a-f-]{36}\\.(jpg|heic)$`).test(rawPath)) return { error: "failed" };
  const m = await member(conversationId);
  if (!m) return { error: "forbidden" };

  const storage = createAdminClient().storage.from(BUCKET);
  const finalPath = `${conversationId}/${randomUUID()}.jpg`;
  try {
    const { data: raw, error: downloadError } = await storage.download(rawPath);
    if (downloadError) throw new Error(`download failed: ${downloadError.name}`);

    let clean: Buffer;
    try {
      clean = await toCleanJpeg(Buffer.from(await raw.arrayBuffer()));
    } catch (error) {
      if (error instanceof UnreadableImageError) return { error: "unreadable" };
      throw error;
    }
    const { width = 0, height = 0 } = await sharp(clean).metadata();
    const { error: uploadError } = await storage.upload(finalPath, clean, { contentType: "image/jpeg" });
    if (uploadError) throw new Error(`upload failed: ${uploadError.name}`);

    // The member's own session: the database checks they may post here.
    const { data, error } = await m.supabase
      .rpc("post_chat_image", { p_conversation_id: conversationId, p_path: finalPath, p_width: width, p_height: height })
      .single();
    if (error) {
      await storage.remove([finalPath]);
      if (error.code === "42501") return { error: "forbidden" };
      throw new Error(`post failed: ${error.code}`);
    }
    return { message: toChatMessage(data) };
  } catch (error) {
    // No paths or bodies in logs.
    console.error("chat image failed", error instanceof Error ? error.message.split(":")[0] : "unknown");
    return { error: "failed" };
  } finally {
    await storage.remove([rawPath]);
  }
}

// ── Email notifications (CLAUDE.md › Email notifications) ──

const notifySchema = z.object({ conversationId: z.uuid() });

/**
 * After sending a message: queue the delayed email check for the other
 * member. The browser skips this while they have the chat open (presence);
 * the check itself also stops if the message has been read by then.
 */
export async function notifyNewMessage(input: { conversationId: string }): Promise<void> {
  const parsed = notifySchema.safeParse(input);
  if (!parsed.success) return;
  const m = await member(parsed.data.conversationId);
  if (!m) return;
  after(() => queueChatEmails(parsed.data.conversationId, m.viewer.id));
}

// ── Message translation (CLAUDE.md › Chat: server-side, cached) ──

export type MessageTranslation = { id: string; text: string; same: boolean };

/** Translation batches a member may request per hour. */
const TRANSLATE_LIMIT = 120;
const translateSchema = z.object({
  conversationId: z.uuid(),
  locale: z.string().refine(isLocale),
  messageIds: z.array(z.uuid()).min(1).max(50),
});

/**
 * The reader's-language version of some messages. Each message is sent to
 * DeepL at most once per language; later readers get the saved copy.
 * `same` means the message was already in that language.
 */
export async function translateMessages(input: {
  conversationId: string;
  locale: string;
  messageIds: string[];
}): Promise<{ translations: MessageTranslation[] } | { error: "notConfigured" | "rateLimited" | "forbidden" | "failed" }> {
  const parsed = translateSchema.safeParse(input);
  if (!parsed.success) return { error: "failed" };
  if (!isTranslationConfigured()) return { error: "notConfigured" };
  const { conversationId, messageIds } = parsed.data;
  const locale = parsed.data.locale as Parameters<typeof translateMany>[1];
  const m = await member(conversationId);
  if (!m) return { error: "forbidden" };

  // The member's own session: RLS returns only messages they may read.
  const [{ data: messages, error: messagesError }, { data: saved, error: savedError }] = await Promise.all([
    m.supabase
      .from("messages")
      .select("id, body")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .in("id", messageIds),
    m.supabase
      .from("message_translations")
      .select("message_id, body, detected_locale")
      .eq("locale", locale)
      .in("message_id", messageIds),
  ]);
  if (messagesError || savedError) return { error: "failed" };

  const result = new Map(
    saved.map((t) => [t.message_id, { id: t.message_id, text: t.body, same: t.detected_locale === locale }]),
  );
  const missing = messages.filter((msg) => !result.has(msg.id) && msg.body.trim());
  if (missing.length) {
    if (!(await withinRateLimit(`chat-translate:${m.viewer.id}`, TRANSLATE_LIMIT, 3600))) {
      return { error: "rateLimited" };
    }
    try {
      const translated = await translateMany(
        missing.map((msg) => msg.body),
        locale,
      );
      const rows = missing.map((msg, i) => ({
        message_id: msg.id,
        locale,
        body: translated[i]!.text,
        detected_locale: translated[i]!.detected || null,
      }));
      // Translations are written by the server only.
      const { error } = await createAdminClient()
        .from("message_translations")
        .upsert(rows, { onConflict: "message_id,locale", ignoreDuplicates: true });
      if (error) console.error("saving translations failed", error.code);
      for (const row of rows) {
        result.set(row.message_id, { id: row.message_id, text: row.body, same: row.detected_locale === locale });
      }
    } catch (error) {
      // Status only, never the text (see TranslationError).
      console.error("message translation failed", error instanceof Error ? error.message : "unknown");
      return { error: "failed" };
    }
  }
  return { translations: [...result.values()] };
}
