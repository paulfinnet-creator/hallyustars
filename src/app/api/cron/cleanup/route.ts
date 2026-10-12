import { timingSafeEqual } from "node:crypto";
import { runDailyCleanup } from "@/lib/cleanup/jobs";
import { serverEnv } from "@/lib/env.server";

/**
 * Daily cleanup, called by Vercel Cron (vercel.json). Vercel sends
 * "Authorization: Bearer <CRON_SECRET>".
 */
export const maxDuration = 300;

function authorized(header: string | null): boolean {
  const expected = Buffer.from(`Bearer ${serverEnv("CRON_SECRET")}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return new Response("unauthorized", { status: 401 });
  const result = await runDailyCleanup();
  // Counts only: never file paths or accounts.
  console.info("daily cleanup", result);
  return Response.json(result);
}
