"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const LINKS = [
  { href: "/admin/invites", key: "invites" },
  { href: "/admin/verifications", key: "verifications" },
  { href: "/admin/celebrities", key: "celebrities" },
  { href: "/admin/chat-invitations", key: "chatInvitations" },
  { href: "/admin/moderation", key: "moderation" },
  { href: "/admin/analytics", key: "analytics" },
  { href: "/admin/audit", key: "audit" },
  { href: "/admin/settings", key: "settings" },
] as const;

/** Badge labels for sections with something waiting. */
const WAITING_LABEL = {
  verifications: "nav.pendingReviews",
  chatInvitations: "nav.pendingInvitations",
  moderation: "nav.openReports",
} as const;

type Waiting = Record<keyof typeof WAITING_LABEL, number>;

export function AdminNav({ waiting }: { waiting: Waiting }) {
  const t = useTranslations("admin");
  const pathname = usePathname();

  return (
    <nav aria-label={t("navLabel")} className="flex flex-wrap items-center gap-2">
      <span className="me-2 font-heading text-lg font-semibold">{t("title")}</span>
      {LINKS.map(({ href, key }) => {
        const current = pathname === href || pathname.startsWith(`${href}/`);
        const count = key in waiting ? waiting[key as keyof Waiting] : 0;
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-ink hover:bg-band aria-[current=page]:bg-band"
          >
            {t(`nav.${key}`)}
            {count > 0 && (
              <span
                className="rounded-full bg-accent px-1.5 text-xs text-white"
                aria-label={t(WAITING_LABEL[key as keyof Waiting], { count })}
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
