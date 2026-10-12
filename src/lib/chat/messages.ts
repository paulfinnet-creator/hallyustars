/** Chat message shapes and display helpers shared by server and browser. */

export const MESSAGE_MAX = 4000;
export const PAGE_SIZE = 50;

/** The quick reactions offered under each message. */
export const REACTIONS = ["❤️", "😂", "😮", "😢", "👍", "🙏"] as const;

export type ImageAttachment = { type: "image"; path: string; width: number; height: number };

export type ChatMessage = {
  id: string;
  senderId: string;
  body: string;
  attachments: ImageAttachment[];
  createdAt: string;
  deleted: boolean;
};

export type Reaction = { messageId: string; userId: string; emoji: string };

type MessageRow = {
  id: string;
  sender_id: string;
  body: string;
  attachments: unknown;
  created_at: string;
  deleted_at: string | null;
};

/** Only well-formed image attachments survive; anything else is dropped. */
function toAttachments(value: unknown): ImageAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (a): a is ImageAttachment =>
      typeof a === "object" &&
      a !== null &&
      a.type === "image" &&
      typeof a.path === "string" &&
      typeof a.width === "number" &&
      typeof a.height === "number",
  );
}

export function toChatMessage(row: MessageRow): ChatMessage {
  const deleted = row.deleted_at !== null;
  return {
    id: row.id,
    senderId: row.sender_id,
    body: deleted ? "" : row.body,
    attachments: deleted ? [] : toAttachments(row.attachments),
    createdAt: row.created_at,
    deleted,
  };
}

/** Insert or replace by id, keeping the list in time order (realtime may echo our own sends). */
export function mergeMessages(list: readonly ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[] {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** Reaction counts for one message, in the REACTIONS order, with whether I reacted. */
export function summarizeReactions(reactions: readonly Reaction[], messageId: string, me: string) {
  const mine = reactions.filter((r) => r.messageId === messageId);
  return REACTIONS.map((emoji) => {
    const forEmoji = mine.filter((r) => r.emoji === emoji);
    return { emoji, count: forEmoji.length, byMe: forEmoji.some((r) => r.userId === me) };
  }).filter((r) => r.count > 0);
}

/** The latest of my messages the other person has read, for the "Seen" mark. */
export function lastSeenMessageId(
  messages: readonly ChatMessage[],
  me: string,
  otherLastReadAt: string | null,
): string | null {
  if (!otherLastReadAt) return null;
  const readUntil = Date.parse(otherLastReadAt);
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.senderId === me && Date.parse(m.createdAt) <= readUntil) return m.id;
  }
  return null;
}

/**
 * A readable place for an IANA zone, e.g. "Asia/Seoul" → "Seoul",
 * "America/Argentina/Buenos_Aires" → "Buenos Aires".
 */
export function placeFromTimeZone(timeZone: string): string {
  return (timeZone.split("/").pop() ?? timeZone).replaceAll("_", " ");
}
