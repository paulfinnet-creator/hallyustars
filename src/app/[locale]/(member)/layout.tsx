import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui";
import { isLocale } from "@/i18n/config";
import { requireSignedInMember } from "@/lib/auth/viewer";
import { signOut } from "../sign-in/actions";
import { MemberNav } from "./MemberNav";

export async function generateMetadata() {
  const t = await getTranslations("common");
  return { title: t("siteName"), robots: { index: false } };
}

export default async function MemberLayout({ children }: { children: ReactNode }) {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  const { viewer } = await requireSignedInMember(locale);
  const t = await getTranslations("member");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <MemberNav role={viewer.role} />
        <form action={signOut} className="flex items-center gap-3">
          <span className="text-sm text-muted">{viewer.display_name}</span>
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="secondary">
            {t("signOut")}
          </Button>
        </form>
      </div>
      {children}
    </div>
  );
}
