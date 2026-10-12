import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { requireAdminPage } from "@/lib/auth/viewer";
import { cardUrl } from "@/lib/celebrities/photo";

export default async function CelebritiesPage() {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  const { supabase } = await requireAdminPage(locale);
  const t = await getTranslations("admin.celebrities");
  const tc = await getTranslations("common.categories");

  const { data, error } = await supabase
    .from("celebrity_profiles")
    .select("id, stage_name, category, group_name, accepts_invites, photo_url, user_id")
    .order("stage_name");
  if (error) throw new Error(`celebrities query failed: ${error.code}`);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">{t("title")}</h1>
        <Link
          href="/admin/celebrities/new"
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-ink hover:opacity-90"
        >
          {t("new")}
        </Link>
      </div>

      {data.length === 0 ? (
        <p className="text-muted">{t("empty")}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c) => (
            <li key={c.id} className="flex gap-4 rounded-xl border border-border bg-surface p-4">
              <div className="aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-md border-2 border-gold bg-band">
                {c.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL
                  <img src={cardUrl(c.photo_url)} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <Link href={`/admin/celebrities/${c.id}`} className="text-lg font-semibold break-words hover:underline">
                  {c.stage_name}
                </Link>
                <p className="text-sm text-muted">
                  {tc(c.category)}
                  {c.group_name && ` · ${c.group_name}`}
                </p>
                <p className="text-xs text-muted">{c.accepts_invites ? t("acceptsInvites") : t("notAcceptingInvites")}</p>
                {!c.user_id && <p className="text-xs text-accent">{t("noLoginAccount")}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
