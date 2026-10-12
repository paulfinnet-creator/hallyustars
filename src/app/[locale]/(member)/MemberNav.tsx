"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const LINKS = {
  fan: [
    { href: "/celebrities", key: "member.celebrities" },
    { href: "/chats", key: "member.chats" },
    { href: "/invitations", key: "member.invitations" },
    { href: "/settings", key: "member.settings" },
  ],
  celebrity: [
    { href: "/chats", key: "member.chats" },
    { href: "/settings", key: "member.settings" },
  ],
  admin: [
    { href: "/celebrities", key: "member.celebrities" },
    { href: "/admin/invites", key: "admin.title" },
  ],
} as const;

export function MemberNav({ role }: { role: "fan" | "celebrity" | "admin" }) {
  const t = useTranslations();
  const pathname = usePathname();
  const links = LINKS[role].map(({ href, key }) => ({ href, label: t(key) }));
  const home = links[0]!.href;

  return (
    <nav aria-label={t("member.navLabel")} className="flex flex-wrap items-center gap-2">
      <Link href={home} className="me-2 font-heading text-lg font-semibold">
        {t("common.siteName")}
      </Link>
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}
          className="rounded-full px-3 py-1 text-sm font-medium text-ink hover:bg-band aria-[current=page]:bg-band"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
