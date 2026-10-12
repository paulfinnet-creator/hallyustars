import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The daily cleanup (api/cron/cleanup). Each step does a batch per run and
 * skips anything that fails; the next run tries again. Never log file paths.
 */

const ID_BUCKET = "id-documents";
const BATCH = 100;

type Admin = ReturnType<typeof createAdminClient>;

/** ID images whose retention period after the decision has passed. */
async function deleteDueIdDocuments(admin: Admin): Promise<number> {
  const { data: due, error } = await admin.rpc("cleanup_due_id_documents", { p_limit: BATCH });
  if (error) throw new Error(`cleanup: due IDs query failed (${error.code})`);
  let deleted = 0;
  for (const { id, id_document_path: path } of due) {
    const { error: removeError } = await admin.storage.from(ID_BUCKET).remove([path]);
    if (removeError) continue;
    const { error: markError } = await admin.rpc("cleanup_mark_id_deleted", { p_verification_id: id });
    if (!markError) deleted += 1;
  }
  return deleted;
}

/** Every file under one fan's folder (their uploads in progress). */
async function removeFanFiles(admin: Admin, userId: string): Promise<boolean> {
  const storage = admin.storage.from(ID_BUCKET);
  const paths: string[] = [];
  for (const folder of [userId, `${userId}/uploads`]) {
    const { data, error } = await storage.list(folder, { limit: 1000 });
    if (error) return false;
    // Folders are listed without an id.
    paths.push(...data.filter((entry) => entry.id).map((entry) => `${folder}/${entry.name}`));
  }
  if (paths.length === 0) return true;
  const { error } = await storage.remove(paths);
  return !error;
}

/** Registrations nobody has continued for the configured number of days. */
async function removeAbandonedRegistrations(admin: Admin): Promise<number> {
  const { data: due, error } = await admin.rpc("cleanup_due_registrations", { p_limit: BATCH });
  if (error) throw new Error(`cleanup: due registrations query failed (${error.code})`);
  let removed = 0;
  for (const { user_id: userId } of due) {
    if (!(await removeFanFiles(admin, userId))) continue;
    const { data: abandoned, error: abandonError } = await admin.rpc("cleanup_abandon_registration", { p_user_id: userId });
    if (abandonError || !abandoned) continue;
    // Deleting the Auth account removes the profile and draft with it.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (!deleteError) removed += 1;
  }
  return removed;
}

export async function runDailyCleanup() {
  const admin = createAdminClient();
  return {
    idDocumentsDeleted: await deleteDueIdDocuments(admin),
    registrationsRemoved: await removeAbandonedRegistrations(admin),
  };
}
