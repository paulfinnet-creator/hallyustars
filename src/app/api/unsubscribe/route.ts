import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * One-click unsubscribe (RFC 8058): mail apps POST here from the
 * List-Unsubscribe header. Turns chat emails off. People clicking the link in
 * the email go to /[locale]/unsubscribe instead, which asks first.
 */
export async function POST(request: Request) {
  const token = z.uuid().safeParse(new URL(request.url).searchParams.get("token"));
  if (!token.success) return new Response("bad request", { status: 400 });
  const supabase = createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await supabase.rpc("unsubscribe_chat_emails", { p_token: token.data });
  if (error) return new Response("failed", { status: 500 });
  // Same answer for unknown tokens: nothing to learn from probing.
  return new Response(null, { status: 204 });
}
