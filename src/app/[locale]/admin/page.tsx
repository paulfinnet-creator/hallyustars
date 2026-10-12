import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { redirect } from "@/i18n/navigation";

/** The admin area opens on Invites. */
export default async function AdminHome() {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  return redirect({ href: "/admin/invites", locale });
}
