import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "./database.types";

/**
 * Service-role client: bypasses RLS. Use only for system work that has no
 * acting admin (registration steps, signed upload URLs, email jobs).
 *
 * Admin actions must NOT use this client: run them with the admin's own
 * session (createClient from ./server) so the database audit triggers know who
 * acted and write the audit_logs row in the same transaction.
 */
export function createAdminClient() {
  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
