"use server";

import { z } from "zod";
import { isLocale } from "@/i18n/config";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

/** The "Turn off chat emails" button on the unsubscribe page (no login needed). */
export async function turnOffChatEmails(formData: FormData) {
  // Root params aren't available in Server Actions; the form sends the locale.
  const locale = String(formData.get("locale"));
  if (!isLocale(locale)) return;
  const token = z.uuid().safeParse(formData.get("token"));
  let result: "done" | "invalid" = "invalid";
  if (token.success) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("unsubscribe_chat_emails", { p_token: token.data });
    if (error) console.error("unsubscribe failed", error.code);
    else if (data) result = "done";
  }
  redirect({ href: { pathname: "/unsubscribe", query: { result } }, locale });
}
