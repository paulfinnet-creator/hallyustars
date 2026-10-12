import { getTranslations } from "next-intl/server";
import { InviteFlow } from "../InviteFlow";

export async function generateMetadata() {
  const t = await getTranslations("invite");
  return { title: t("title"), robots: { index: false } };
}

/** The link from the invitation (/invite/SKCE-XXXX-XXXX) fills in the code. */
export default async function InviteLinkPage({ params }: PageProps<"/[locale]/invite/[code]">) {
  const { code } = await params;
  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <InviteFlow initialCode={decodeURIComponent(code).slice(0, 40)} />
    </main>
  );
}
