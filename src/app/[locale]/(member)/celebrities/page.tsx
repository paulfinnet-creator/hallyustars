import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { CelebrityCard } from "@/components/CelebrityCard";
import { isLocale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { requireMemberPage } from "@/lib/auth/viewer";
import { CATEGORIES } from "@/lib/celebrities/fields";
import {
  hasFilters,
  PAGE_SIZE,
  parseDiscoveryParams,
  toPrefixQuery,
  toQuery,
  type DiscoveryFilters,
} from "@/lib/celebrities/search";

export async function generateMetadata() {
  const t = await getTranslations("discover");
  return { title: t("title") };
}

export default async function DiscoverPage({ searchParams }: PageProps<"/[locale]/celebrities">) {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  const { supabase } = await requireMemberPage(locale);
  const t = await getTranslations();
  const filters = parseDiscoveryParams(await searchParams);
  const from = (filters.page - 1) * PAGE_SIZE;

  let query = supabase
    .from("celebrity_profiles")
    .select("id, stage_name, category, group_name, accepts_invites, photo_url, user_id", { count: "exact" });
  const tsquery = toPrefixQuery(filters.q);
  if (tsquery) query = query.textSearch("search", tsquery, { config: "simple" });
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.group) query = query.eq("group_name", filters.group);
  // Same rule as private.can_invite: the star accepts invites and has a login.
  if (filters.openOnly) query = query.eq("accepts_invites", true).not("user_id", "is", null);

  const [{ data, count, error }, { data: groupRows, error: groupError }] = await Promise.all([
    query.order("stage_name").order("id").range(from, from + PAGE_SIZE - 1),
    supabase.from("celebrity_profiles").select("group_name").not("group_name", "is", null),
  ]);
  if (error) throw new Error(`discovery query failed: ${error.code}`);
  if (groupError) throw new Error(`groups query failed: ${groupError.code}`);

  const collator = new Intl.Collator(locale);
  const groups = [...new Set(groupRows.map((r) => r.group_name!))].sort(collator.compare);
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">{t("discover.title")}</h1>
        <p className="text-muted">{t("discover.intro")}</p>
      </div>

      {/* Keyed so the uncontrolled fields reset when the URL changes (e.g. "Clear filters"). */}
      <Filters key={new URLSearchParams(toQuery(filters, 1)).toString()} filters={filters} groups={groups} />

      <p role="status" className="text-sm text-muted">
        {t("discover.resultCount", { count: total })}
      </p>

      {data.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-muted">
          {hasFilters(filters) ? t("discover.noResults") : t("discover.empty")}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((c) => (
            <li key={c.id}>
              <CelebrityCard
                celebrity={{
                  id: c.id,
                  stageName: c.stage_name,
                  category: c.category,
                  groupName: c.group_name,
                  photoUrl: c.photo_url,
                  openToInvites: c.accepts_invites && c.user_id !== null,
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && <Pagination filters={filters} totalPages={totalPages} />}
    </main>
  );
}

/** A plain GET form: works without JavaScript and keeps results linkable. */
async function Filters({ filters, groups }: { filters: DiscoveryFilters; groups: string[] }) {
  const t = await getTranslations();
  const field = "rounded-lg border border-border bg-surface px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";

  return (
    <form
      method="get"
      role="search"
      className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]"
    >
      <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
        <label htmlFor="discover-q" className="text-sm font-medium">
          {t("discover.searchLabel")}
        </label>
        <input id="discover-q" name="q" type="search" defaultValue={filters.q} maxLength={100} className={field} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="discover-category" className="text-sm font-medium">
          {t("discover.category")}
        </label>
        <select id="discover-category" name="category" defaultValue={filters.category ?? ""} className={field}>
          <option value="">{t("discover.any")}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`common.categories.${c}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="discover-group" className="text-sm font-medium">
          {t("discover.group")}
        </label>
        <select id="discover-group" name="group" defaultValue={filters.group ?? ""} className={field}>
          <option value="">{t("discover.any")}</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-1">
        <button
          type="submit"
          className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-ink hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {t("discover.search")}
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2 lg:col-span-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="open" value="1" defaultChecked={filters.openOnly} className="size-4 accent-primary" />
          {t("discover.openOnly")}
        </label>
        {hasFilters(filters) && (
          <Link href="/celebrities" className="text-sm text-primary underline underline-offset-4">
            {t("discover.clear")}
          </Link>
        )}
      </div>
    </form>
  );
}

async function Pagination({ filters, totalPages }: { filters: DiscoveryFilters; totalPages: number }) {
  const t = await getTranslations("discover");
  const linkClass = "rounded-full border border-border bg-surface px-3 py-1 text-sm text-ink hover:bg-band";
  const { page } = filters;
  return (
    <nav aria-label={t("pagination")} className="flex items-center gap-3">
      {page > 1 && (
        <Link href={{ pathname: "/celebrities", query: toQuery(filters, page - 1) }} className={linkClass}>
          {t("previous")}
        </Link>
      )}
      <span className="text-sm text-muted">{t("pageOf", { page, total: totalPages })}</span>
      {page < totalPages && (
        <Link href={{ pathname: "/celebrities", query: toQuery(filters, page + 1) }} className={linkClass}>
          {t("next")}
        </Link>
      )}
    </nav>
  );
}
