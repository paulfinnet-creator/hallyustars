import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { directionFor, isLocale, SUPPORTED } from "@/i18n/config";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
// Swapped for ./fonts.dev.ts under `next dev` (see next.config.ts).
import { fontClassesFor } from "@/app/fonts";
import "../globals.css";

export function generateStaticParams() {
  return SUPPORTED.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return {
    title: t("siteName"),
    description: t("agencyName"),
  };
}

export default async function LocaleLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();

  return (
    <html lang={locale} dir={directionFor(locale)} className={fontClassesFor(locale)}>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider>
          <header className="flex justify-end px-4 py-3">
            <LanguageSwitcher />
          </header>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
