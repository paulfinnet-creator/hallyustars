import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cardUrl } from "@/lib/celebrities/photo";

export type CelebrityCardData = {
  id: string;
  stageName: string;
  category: string;
  groupName: string | null;
  photoUrl: string | null;
  openToInvites: boolean;
};

/** Verified mark for official profiles (CLAUDE.md › Design: photocards). */
export function VerifiedBadge({ label, className = "" }: { label: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={label} className={`inline-block shrink-0 ${className}`}>
      <title>{label}</title>
      <circle cx="12" cy="12" r="11" className="fill-gold" />
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="stroke-white" />
    </svg>
  );
}

/** A K-pop style photocard: 3:4 photo with a gold border, name below. */
export function CelebrityCard({ celebrity: c }: { celebrity: CelebrityCardData }) {
  const t = useTranslations();
  return (
    <Link
      href={`/celebrities/${c.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl border-2 border-gold bg-surface shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <div className="aspect-[3/4] w-full overflow-hidden bg-band">
        {c.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL
          <img
            src={cardUrl(c.photoUrl)}
            alt=""
            width={450}
            height={600}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="flex items-center gap-1.5 font-heading text-lg font-semibold break-words">
          <span className="min-w-0">{c.stageName}</span>
          <VerifiedBadge label={t("discover.verified")} className="size-4" />
        </p>
        <p className="text-sm text-muted">
          {t(`common.categories.${c.category}`)}
          {c.groupName && ` · ${c.groupName}`}
        </p>
        {c.openToInvites && (
          <p className="mt-auto pt-1 text-xs font-medium text-primary">{t("discover.invitesOpen")}</p>
        )}
      </div>
    </Link>
  );
}
