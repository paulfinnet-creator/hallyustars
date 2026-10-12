import "server-only";
import { z } from "zod";

export type ServerEnvKey =
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "QSTASH_TOKEN"
  | "QSTASH_CURRENT_SIGNING_KEY"
  | "QSTASH_NEXT_SIGNING_KEY"
  | "RESEND_API_KEY"
  | "RESEND_WEBHOOK_SECRET"
  | "SEND_EMAIL_HOOK_SECRET"
  | "CRON_SECRET"
  | "TRANSLATION_API_KEY";

const value = z.string().min(1);

/**
 * One server secret, checked when it's first needed. Each feature only
 * requires its own keys, so e.g. registration works before email sending is
 * configured, and a build without secrets still succeeds.
 */
export function serverEnv(key: ServerEnvKey): string {
  const parsed = value.safeParse(process.env[key]);
  if (!parsed.success) throw new Error(`Missing server environment variable ${key}`);
  return parsed.data;
}
