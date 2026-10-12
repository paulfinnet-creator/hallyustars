import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Locale } from "@/i18n/config";
import { redirect } from "@/i18n/navigation";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Profile = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "id" | "role" | "status" | "display_name"
>;

export type Viewer = Profile & {
  /** aal2 once the session has passed the authenticator-app step. */
  mfaVerified: boolean;
};

/** The signed-in person for this request, or null. Deduplicated per request. */
export const getViewer = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { supabase, viewer: null };

  const { data: profile } = await supabase
    .from("users")
    .select("id, role, status, display_name")
    .eq("id", claims.sub)
    .single();
  if (!profile) return { supabase, viewer: null };

  // An admin's token outlives their session for up to an hour (sign-out
  // elsewhere, authenticator reset). Treat a revoked session as signed out;
  // the database refuses admin rights too.
  if (profile.role === "admin") {
    const { data: active } = await supabase.rpc("my_session_active");
    if (!active) return { supabase, viewer: null };
  }

  const viewer: Viewer = { ...profile, mfaVerified: claims.aal === "aal2" };
  return { supabase, viewer };
});

/**
 * Where someone goes after the email code: admins continue to the
 * authenticator step; fans who haven't been approved see their registration;
 * approved fans browse celebrities; celebrities open their chats.
 */
export function landingFor(
  profile: Pick<Viewer, "role" | "status">,
): "mfa" | "/register" | "/celebrities" | "/chats" | "/" {
  if (profile.role === "admin" && profile.status === "approved") return "mfa";
  if (profile.role === "fan" && profile.status === "approved") return "/celebrities";
  if (profile.role === "fan" && profile.status !== "suspended") return "/register";
  if (profile.role === "celebrity" && profile.status === "approved") return "/chats";
  return "/";
}

export function isAdmin(viewer: Viewer | null): viewer is Viewer {
  return viewer?.role === "admin" && viewer.status === "approved";
}

/**
 * For admin pages. Signed out or not past MFA → sign-in page. Anyone who
 * isn't an admin gets a 404, so the admin area doesn't reveal itself.
 */
export async function requireAdminPage(locale: Locale) {
  const { supabase, viewer } = await getViewer();
  if (!viewer) return redirect({ href: "/sign-in", locale });
  if (!isAdmin(viewer)) notFound();
  if (!viewer.mfaVerified) return redirect({ href: "/sign-in", locale });
  return { supabase, viewer };
}

/**
 * The signed-in area shared by fans, celebrities and admins (its layout).
 * Each page then applies its own rule below.
 */
export async function requireSignedInMember(locale: Locale) {
  const { supabase, viewer } = await getViewer();
  if (!viewer) return redirect({ href: "/sign-in", locale });
  if (isAdmin(viewer)) {
    if (!viewer.mfaVerified) return redirect({ href: "/sign-in", locale });
    return { supabase, viewer };
  }
  const landing = landingFor(viewer);
  if (landing === "/celebrities" || landing === "/chats") return { supabase, viewer };
  if (landing === "/register") return redirect({ href: "/register", locale });
  notFound();
}

/**
 * For member pages (celebrity discovery): approved fans, and admins past MFA
 * so they can see what fans see. Celebrities get a 404.
 */
export async function requireMemberPage(locale: Locale) {
  const member = await requireSignedInMember(locale);
  if (member.viewer.role === "celebrity") notFound();
  return member;
}

/**
 * For chat pages: approved fans and celebrities. Admins only read flagged
 * conversations, from moderation, so they get a 404 here.
 */
export async function requireChatPage(locale: Locale) {
  const member = await requireSignedInMember(locale);
  if (member.viewer.role === "admin") notFound();
  return member;
}

/**
 * For admin Server Actions: null unless the caller is an MFA-verified admin.
 * The database checks this again (private.is_admin requires aal2).
 */
export async function requireAdminAction() {
  const { supabase, viewer } = await getViewer();
  if (!isAdmin(viewer) || !viewer.mfaVerified) return null;
  return { supabase, viewer };
}
