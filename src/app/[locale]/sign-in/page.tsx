import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { redirect } from "@/i18n/navigation";
import { getViewer, isAdmin, landingFor } from "@/lib/auth/viewer";
import { SignInFlow } from "./SignInFlow";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("title"), robots: { index: false } };
}

export default async function SignInPage() {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();

  const { viewer } = await getViewer();
  if (viewer && !isAdmin(viewer)) {
    const landing = landingFor(viewer);
    return redirect({ href: landing === "mfa" ? "/" : landing, locale });
  }
  if (viewer?.mfaVerified) return redirect({ href: "/admin/invites", locale });

  // An admin who stopped after the email code resumes at the authenticator step.
  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <SignInFlow initialStep={viewer ? "mfa" : "email"} />
    </main>
  );
}
