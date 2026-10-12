import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Standard Webhooks signatures, used by Resend (svix-* headers) and Supabase
 * Auth hooks (webhook-* headers): HMAC-SHA256 over "<id>.<timestamp>.<raw body>"
 * with the base64 key after "whsec_" (Supabase writes the secret as
 * "v1,whsec_..."). The signature header lists one or more "v1,<base64 signature>".
 */

const TOLERANCE_SECONDS = 5 * 60;

export function isValidWebhook(input: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  now?: Date;
}): boolean {
  const { id, timestamp, signature, body } = input;
  if (!id || !timestamp || !signature) return false;
  const sentAt = Number(timestamp);
  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (!Number.isInteger(sentAt) || Math.abs(now - sentAt) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(input.secret.replace(/^(v1,)?whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
