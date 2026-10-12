"use server";

import { randomUUID } from "node:crypto";
import type { PostgrestError } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { z } from "zod";
import { SUPPORTED, type Locale } from "@/i18n/config";
import { requireAdminAction } from "@/lib/auth/viewer";
import { BIO_SOURCE_LOCALES, profileSchema, type ProfileInput } from "@/lib/celebrities/fields";
import { toCelebrityPhoto, toCleanJpeg, UnreadableImageError } from "@/lib/images/process";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTranslationConfigured, translateText } from "@/lib/translation/deepl";

export type CelebrityError =
  | "invalid"
  | "invalidEmail"
  | "emailInUse"
  | "alreadyLinked"
  | "unreadable"
  | "notFound"
  | "forbidden"
  | "failed";

type Fail = { error: CelebrityError };

function mapError(error: PostgrestError): CelebrityError {
  if (error.code === "42501") return "forbidden";
  if (error.code === "23505") return "alreadyLinked";
  console.error("celebrity action failed", error.code);
  return "failed";
}

function toRow(input: z.output<typeof profileSchema>) {
  return {
    stage_name: input.stageName,
    category: input.category,
    group_name: input.groupName,
    languages: input.languages,
    timezone: input.timezone,
    accepts_invites: input.acceptsInvites,
  };
}

// ── Profile fields ──

export async function createCelebrity(input: ProfileInput): Promise<{ id: string } | Fail> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const admin = await requireAdminAction();
  if (!admin) return { error: "forbidden" };

  const { data, error } = await admin.supabase
    .from("celebrity_profiles")
    .insert(toRow(parsed.data))
    .select("id")
    .single();
  if (error) return { error: mapError(error) };
  return { id: data.id };
}

const idSchema = z.uuid();

export async function updateCelebrity(profileId: string, input: ProfileInput): Promise<{ ok: true } | Fail> {
  const id = idSchema.safeParse(profileId);
  const parsed = profileSchema.safeParse(input);
  if (!id.success || !parsed.success) return { error: "invalid" };
  const admin = await requireAdminAction();
  if (!admin) return { error: "forbidden" };

  const { data, error } = await admin.supabase
    .from("celebrity_profiles")
    .update(toRow(parsed.data))
    .eq("id", id.data)
    .select("id");
  if (error) return { error: mapError(error) };
  if (!data.length) return { error: "notFound" };
  refresh();
  return { ok: true };
}

// ── Bio and translations ──

export type TranslationOutcome = { configured: boolean; translated: number; failed: number };

type AdminSession = NonNullable<Awaited<ReturnType<typeof requireAdminAction>>>;

/**
 * Machine-translate the original bio into every other language. Translations
 * an admin edited by hand are kept unless `overwriteEdited`.
 */
async function translateAll(
  admin: AdminSession,
  profileId: string,
  overwriteEdited: boolean,
): Promise<TranslationOutcome> {
  if (!isTranslationConfigured()) return { configured: false, translated: 0, failed: 0 };

  const { data: profile } = await admin.supabase
    .from("celebrity_profiles")
    .select("bio_source_locale")
    .eq("id", profileId)
    .single();
  const source = profile?.bio_source_locale as Locale | null | undefined;
  if (!source) return { configured: true, translated: 0, failed: 0 };

  const { data: rows } = await admin.supabase
    .from("celebrity_profile_translations")
    .select("locale, bio, is_machine_translated")
    .eq("profile_id", profileId);
  const original = rows?.find((r) => r.locale === source)?.bio;
  if (!original) return { configured: true, translated: 0, failed: 0 };
  const handEdited = new Set(rows?.filter((r) => !r.is_machine_translated).map((r) => r.locale));

  const targets = SUPPORTED.filter((l) => l !== source && (overwriteEdited || !handEdited.has(l)));
  const results = await Promise.allSettled(targets.map((l) => translateText(original, source, l)));

  const translated = targets.flatMap((locale, i) => {
    const r = results[i]!;
    return r.status === "fulfilled" ? [{ profile_id: profileId, locale, bio: r.value, is_machine_translated: true }] : [];
  });
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed) console.error("bio translation failed for", failed, "languages");

  if (translated.length) {
    const { error } = await admin.supabase.from("celebrity_profile_translations").upsert(translated);
    if (error) return { configured: true, translated: 0, failed: targets.length };
  }
  return { configured: true, translated: translated.length, failed };
}

const bioSchema = z.object({
  profileId: z.uuid(),
  sourceLocale: z.enum(BIO_SOURCE_LOCALES),
  bio: z.string().trim().min(1).max(4000),
});

/** Save the original bio (Korean or English), then translate it into the other languages. */
export async function saveBio(input: z.input<typeof bioSchema>): Promise<TranslationOutcome | Fail> {
  const parsed = bioSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const { profileId, sourceLocale, bio } = parsed.data;
  const admin = await requireAdminAction();
  if (!admin) return { error: "forbidden" };

  const { error: rowError } = await admin.supabase
    .from("celebrity_profile_translations")
    .upsert({ profile_id: profileId, locale: sourceLocale, bio, is_machine_translated: false });
  if (rowError) return { error: mapError(rowError) };
  const { error: profileError } = await admin.supabase
    .from("celebrity_profiles")
    .update({ bio_source_locale: sourceLocale, bio_updated_at: new Date().toISOString() })
    .eq("id", profileId);
  if (profileError) return { error: mapError(profileError) };

  const outcome = await translateAll(admin, profileId, false);
  refresh();
  return outcome;
}

export async function retranslateBio(input: { profileId: string; overwriteEdited: boolean }): Promise<TranslationOutcome | Fail> {
  const id = idSchema.safeParse(input.profileId);
  if (!id.success) return { error: "invalid" };
  const admin = await requireAdminAction();
  if (!admin) return { error: "forbidden" };
  const outcome = await translateAll(admin, id.data, input.overwriteEdited === true);
  refresh();
  return outcome;
}

const translationSchema = z.object({
  profileId: z.uuid(),
  locale: z.enum(SUPPORTED),
  bio: z.string().trim().max(4000),
});

/** An admin's own wording for one language. Empty removes that translation. */
export async function saveTranslation(input: z.input<typeof translationSchema>): Promise<{ ok: true } | Fail> {
  const parsed = translationSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const { profileId, locale, bio } = parsed.data;
  const admin = await requireAdminAction();
  if (!admin) return { error: "forbidden" };

  const table = admin.supabase.from("celebrity_profile_translations");
  const { error } = bio
    ? await table.upsert({ profile_id: profileId, locale, bio, is_machine_translated: false })
    : await table.delete().eq("profile_id", profileId).eq("locale", locale);
  if (error) return { error: mapError(error) };
  refresh();
  return { ok: true };
}

// ── Photo ──

const AVATARS = "avatars";

export async function createPhotoUpload(input: { format: "jpg" | "heic" }): Promise<{ path: string; token: string } | Fail> {
  const format = z.enum(["jpg", "heic"]).safeParse(input.format);
  if (!format.success) return { error: "invalid" };
  const admin = await requireAdminAction();
  if (!admin) return { error: "forbidden" };

  // Raw uploads land in the private bucket; only the processed JPG is published.
  const path = `staff/${admin.viewer.id}/uploads/${randomUUID()}.${format.data}`;
  const { data, error } = await createAdminClient().storage.from("id-documents").createSignedUploadUrl(path);
  if (error) return { error: "failed" };
  return { path, token: data.token };
}

const photoSchema = z.object({
  profileId: z.uuid(),
  path: z.string().max(200),
  purpose: z.enum(["source", "photo"]),
});

/**
 * source: convert an uploaded HEIC so the crop tool can show it.
 * photo: publish the cropped 3:4 photo (plus a card-size copy) to the public
 * avatars bucket and set it on the profile.
 */
export async function processCelebrityPhoto(
  input: z.input<typeof photoSchema>,
): Promise<{ previewUrl: string } | { photoUrl: string } | Fail> {
  const parsed = photoSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const { profileId, path, purpose } = parsed.data;
  const admin = await requireAdminAction();
  if (!admin) return { error: "forbidden" };
  if (!new RegExp(`^staff/${admin.viewer.id}/uploads/[0-9a-f-]{36}\\.(jpg|heic)$`).test(path)) return { error: "invalid" };

  const service = createAdminClient();
  const raw = service.storage.from("id-documents");
  const { data: blob, error: downloadError } = await raw.download(path);
  if (downloadError) return { error: "failed" };

  let clean: Buffer;
  try {
    clean = await toCleanJpeg(Buffer.from(await blob.arrayBuffer()));
  } catch (error) {
    if (error instanceof UnreadableImageError) return { error: "unreadable" };
    throw error;
  } finally {
    await raw.remove([path]); // the raw upload is never needed again
  }

  if (purpose === "source") {
    const previewPath = `staff/${admin.viewer.id}/uploads/${randomUUID()}.jpg`;
    if ((await raw.upload(previewPath, clean, { contentType: "image/jpeg" })).error) return { error: "failed" };
    const { data } = await raw.createSignedUrl(previewPath, 600);
    return data ? { previewUrl: data.signedUrl } : { error: "failed" };
  }

  const { data: profile } = await admin.supabase
    .from("celebrity_profiles")
    .select("photo_url")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return { error: "notFound" };

  const { photo, card } = await toCelebrityPhoto(clean);
  const base = `celebrities/${profileId}/${randomUUID()}`;
  const pub = service.storage.from(AVATARS);
  for (const [target, body] of [[`${base}.jpg`, photo], [`${base}-card.jpg`, card]] as const) {
    if ((await pub.upload(target, body, { contentType: "image/jpeg" })).error) return { error: "failed" };
  }
  const photoUrl = pub.getPublicUrl(`${base}.jpg`).data.publicUrl;

  const { error } = await admin.supabase.from("celebrity_profiles").update({ photo_url: photoUrl }).eq("id", profileId);
  if (error) {
    await pub.remove([`${base}.jpg`, `${base}-card.jpg`]);
    return { error: mapError(error) };
  }

  // Remove the previous photo's files.
  const oldPath = profile.photo_url?.split(`/object/public/${AVATARS}/`)[1];
  if (oldPath) await pub.remove([oldPath, oldPath.replace(/\.jpg$/, "-card.jpg")]);

  refresh();
  return { photoUrl };
}

// ── Login account ──

const accountSchema = z.object({ profileId: z.uuid(), email: z.email().max(254) });

/**
 * Create the celebrity's login account (email code sign-in) and link it to
 * the profile. The link step records the admin in the audit log.
 */
export async function createLoginAccount(input: z.input<typeof accountSchema>): Promise<{ ok: true } | Fail> {
  const parsed = accountSchema.safeParse({ ...input, email: input.email.trim().toLowerCase() });
  if (!parsed.success) return { error: parsed.error.issues[0]?.path[0] === "email" ? "invalidEmail" : "invalid" };
  const { profileId, email } = parsed.data;
  const admin = await requireAdminAction();
  if (!admin) return { error: "forbidden" };

  const { data: profile } = await admin.supabase
    .from("celebrity_profiles")
    .select("stage_name, timezone, user_id")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return { error: "notFound" };
  if (profile.user_id) return { error: "alreadyLinked" };

  const service = createAdminClient();
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { role: "celebrity" },
    user_metadata: { display_name: profile.stage_name, locale: "ko", timezone: profile.timezone },
  });
  if (createError || !created.user) {
    if (createError?.code === "email_exists") return { error: "emailInUse" };
    console.error("celebrity account creation failed", createError?.code);
    return { error: "failed" };
  }

  const { error } = await admin.supabase.rpc("admin_link_new_celebrity_account", {
    p_profile_id: profileId,
    p_user_id: created.user.id,
  });
  if (error) {
    await service.auth.admin.deleteUser(created.user.id);
    return { error: mapError(error) };
  }
  refresh();
  return { ok: true };
}
