import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function HomePage() {
  const t = useTranslations();

  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-16 text-center">
      <Image
        src="/brand/emblem.png"
        alt=""
        width={96}
        height={96}
        priority
      />
      <p className="text-sm tracking-wide text-muted">{t("common.agencyName")}</p>
      <h1 className="text-4xl font-semibold text-ink">{t("common.siteName")}</h1>
      <p className="text-lg text-muted">{t("home.tagline")}</p>
      <Link
        href="/invite"
        className="rounded-full bg-primary px-6 py-3 font-medium text-primary-ink hover:opacity-90"
      >
        {t("home.enterWithInvite")}
      </Link>
      <Link href="/sign-in" className="text-sm font-medium text-primary underline underline-offset-4">
        {t("home.signIn")}
      </Link>
    </main>
  );
}
