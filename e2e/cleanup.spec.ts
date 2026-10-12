import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { E2E_CRON_SECRET } from "./constants";
import { createUser, hasLocalSupabase, serviceClient } from "./support";

test.skip(!hasLocalSupabase, "needs local Supabase: npm run db:start and .env.local");

const BUCKET = "id-documents";
const JPEG = Buffer.from("ffd8ffe000104a46494600010100000100010000ffd9", "hex");
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

test("the daily cleanup needs Vercel Cron's secret", async ({ request }) => {
  expect((await request.get("/api/cron/cleanup")).status()).toBe(401);
  const wrong = await request.get("/api/cron/cleanup", { headers: { authorization: "Bearer nope" } });
  expect(wrong.status()).toBe(401);
});

test("the daily cleanup deletes old ID images and abandoned registrations", async ({ request }, testInfo) => {
  const db = serviceClient();
  const storage = db.storage.from(BUCKET);

  // A fan who started registering 40 days ago and never came back.
  const idle = await createUser("fan", testInfo);
  await db.from("users").update({ status: "registering", created_at: daysAgo(40) }).eq("id", idle.id);
  const idleFiles = [`${idle.id}/profile-${randomUUID()}.jpg`, `${idle.id}/uploads/${randomUUID()}.jpg`];
  for (const path of idleFiles) {
    const { error } = await storage.upload(path, JPEG, { contentType: "image/jpeg" });
    if (error) throw error;
  }
  await db.from("registration_drafts").insert({ user_id: idle.id, profile_photo_path: idleFiles[0], updated_at: daysAgo(40) });
  const { data: invite } = await db
    .from("invites")
    .insert({
      fan_name: "Idle fan",
      email: idle.email,
      status: "registering",
      created_by_admin: "a0000000-0000-4000-8000-000000000001",
      user_id: idle.id,
      used_at: daysAgo(40),
    })
    .select("id")
    .single();

  // A fan approved 31 days ago: their ID image is due.
  const approved = await createUser("fan", testInfo);
  const idPath = `${approved.id}/id-${randomUUID()}.jpg`;
  await storage.upload(idPath, JPEG, { contentType: "image/jpeg" });
  const { data: verification } = await db
    .from("verifications")
    .insert({
      user_id: approved.id,
      profile_photo_path: `${approved.id}/profile-x.jpg`,
      id_document_path: idPath,
      id_document_type: "passport",
      status: "approved",
      reviewed_by: "a0000000-0000-4000-8000-000000000001",
      decided_at: daysAgo(31),
    })
    .select("id")
    .single();

  // A registration from today is left alone.
  const fresh = await createUser("fan", testInfo);
  await db.from("users").update({ status: "registering" }).eq("id", fresh.id);

  const response = await request.get("/api/cron/cleanup", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
  expect(response.status()).toBe(200);

  // The idle registration is gone; its invite can be given a new code.
  expect((await db.auth.admin.getUserById(idle.id)).data.user).toBeNull();
  const { data: idleInvite } = await db.from("invites").select("status, user_id").eq("id", invite!.id).single();
  expect(idleInvite).toEqual({ status: "expired", user_id: null });
  for (const folder of [idle.id, `${idle.id}/uploads`]) {
    const { data } = await storage.list(folder);
    expect(data!.filter((entry) => entry.id)).toEqual([]);
  }

  // The old ID image is deleted; the verification record stays.
  const { data: record } = await db
    .from("verifications")
    .select("status, id_document_path, id_deleted_at")
    .eq("id", verification!.id)
    .single();
  expect(record!.status).toBe("approved");
  expect(record!.id_document_path).toBeNull();
  expect(record!.id_deleted_at).not.toBeNull();
  const { data: left } = await storage.list(approved.id);
  expect(left!.map((entry) => entry.name)).not.toContain(idPath.split("/")[1]);

  // The fresh registration is still there.
  expect((await db.auth.admin.getUserById(fresh.id)).data.user).not.toBeNull();
});
