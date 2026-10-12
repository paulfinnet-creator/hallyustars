import { getTranslations } from "next-intl/server";
import { InviteFlow } from "./InviteFlow";

export async function generateMetadata() {
  const t = await getTranslations("invite");
  return { title: t("title"), robots: { index: false } };
}

export default function InvitePage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <InviteFlow initialCode="" />
    </main>
  );
}
