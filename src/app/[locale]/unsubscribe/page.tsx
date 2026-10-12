import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui";
import { isLocale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { turnOffChatEmails } from "./actions";

export async function generateMetadata() {
  const t = await getTranslations("unsubscribe");
  return { title: t("title"), robots: { index: false } };
}

/**
 * Opened from the link in chat emails. Asks before turning emails off, so
 * mail scanners that open links don't unsubscribe anyone. Mail apps use the
 * one-click endpoint (/api/unsubscribe) instead.
 */
export default async function UnsubscribePage({ searchParams }: PageProps<"/[locale]/unsubscribe">) {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  const t = await getTranslations("unsubscribe");
  const { token, result } = await searchParams;

  let content;
  if (result === "done") {
    content = (
      <>
        <p role="status">{t("done")}</p>
        <Link href="/settings" className="self-start text-primary underline underline-offset-4">
          {t("settingsLink")}
        </Link>
      </>
    );
  } else if (result === "invalid" || typeof token !== "string") {
    content = <p role="alert">{t("invalid")}</p>;
  } else {
    content = (
      <form action={turnOffChatEmails} className="flex flex-col gap-4">
        <p>{t("prompt")}</p>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" className="self-start">
          {t("confirm")}
        </Button>
      </form>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-12">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {content}
    </main>
  );
}
