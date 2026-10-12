import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The caller's IP. On Vercel this header is set by the platform (a value sent
 * by the browser is overwritten), so it can't be spoofed there. The e2e tests
 * rely on the local server trusting it to give each test its own address.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/**
 * Count one attempt; false once `max` attempts happened within `windowSeconds`.
 * Fails closed: if the database can't be asked, the attempt is refused.
 */
export async function withinRateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("hit_rate_limit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rate limit check failed", error.code);
    return false;
  }
  return data;
}
