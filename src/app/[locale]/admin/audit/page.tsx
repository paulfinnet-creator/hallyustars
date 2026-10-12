import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { z } from "zod";
import { LocalTime } from "@/components/LocalTime";
import { Button } from "@/components/ui";
import { isLocale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { requireAdminPage } from "@/lib/auth/viewer";
import { startOfDayInZone } from "@/lib/time/format";

const PAGE_SIZE = 50;
const DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "medium" };

/** What admins change (audit_logs.target_type), for the area filter. */
const AREAS = [
  "invites",
  "verifications",
  "users",
  "celebrity_profiles",
  "celebrity_profile_translations",
  "chat_invitations",
  "conversations",
  "messages",
  "reports",
  "platform_settings",
] as const;

/** The verb part of audit_logs.action ("invites.update" → "update"). */
const ACTIONS = [
  "insert",
  "update",
  "delete",
  "email_viewed",
  "id_viewed",
  "celebrity_account_created",
  "admin_created",
  "mfa_reset",
  "viewed",
  "closed",
] as const;

const SETTING_KEYS = [
  "invite_expiry_days",
  "invite_max_email_attempts",
  "invite_lock_minutes",
  "id_document_retention_days",
  "chat_invitation_expiry_days",
  "abandoned_registration_days",
] as const;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const filtersSchema = z.object({
  admin: z.uuid().optional().catch(undefined),
  area: z.enum(AREAS).optional().catch(undefined),
  from: day.optional().catch(undefined),
  to: day.optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});

const isOneOf = <T extends string>(list: readonly T[], value: string): value is T => (list as readonly string[]).includes(value);

export async function generateMetadata() {
  const t = await getTranslations("admin.audit");
  return { title: t("title") };
}

/** Every admin action, newest first. Read-only: the table is append-only. */
export default async function AuditLogPage({ searchParams }: PageProps<"/[locale]/admin/audit">) {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  const { supabase, viewer } = await requireAdminPage(locale);
  const t = await getTranslations("admin.audit");
  const tSettings = await getTranslations("admin.settings.fields");

  const filters = filtersSchema.parse(await searchParams);
  const [{ data: admins }, { data: me }] = await Promise.all([
    supabase.from("users").select("id, display_name").eq("role", "admin").order("display_name"),
    supabase.from("users").select("timezone").eq("id", viewer.id).single(),
  ]);
  // Dates mean midnight to midnight in the admin's own timezone.
  const timeZone = me?.timezone ?? "UTC";

  let query = supabase
    .from("audit_logs")
    .select("id, action, target_type, target_id, metadata, created_at, admin:users!audit_logs_admin_id_fkey(display_name)", {
      count: "exact",
    })
    .order("id", { ascending: false });
  if (filters.admin) query = query.eq("admin_id", filters.admin);
  if (filters.area) query = query.eq("target_type", filters.area);
  if (filters.from) query = query.gte("created_at", startOfDayInZone(filters.from, timeZone).toISOString());
  if (filters.to) {
    // Up to the end of that day: before the next one starts.
    const [y, m, d] = filters.to.split("-").map(Number);
    const nextDay = new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10);
    query = query.lt("created_at", startOfDayInZone(nextDay, timeZone).toISOString());
  }
  const from = (filters.page - 1) * PAGE_SIZE;
  const { data: entries, count, error } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(`audit log query failed: ${error.code}`);

  // Names for entries about accounts.
  const userIds = [...new Set(entries.filter((e) => e.target_type === "users" && e.target_id).map((e) => e.target_id!))];
  const { data: targets } = userIds.length
    ? await supabase.from("users").select("id, display_name").in("id", userIds)
    : { data: [] as { id: string; display_name: string }[] };
  const names = new Map((targets ?? []).map((u) => [u.id, u.display_name]));

  const describeAction = (action: string, area: string) => {
    const verb = action.slice(action.indexOf(".") + 1);
    const areaLabel = isOneOf(AREAS, area) ? t(`areas.${area}`) : area;
    return `${areaLabel} · ${isOneOf(ACTIONS, verb) ? t(`actions.${verb}`) : verb}`;
  };
  const describeTarget = (area: string, id: string | null) => {
    if (!id) return "";
    if (area === "users") return names.get(id) ?? id.slice(0, 8);
    if (area === "platform_settings") return isOneOf(SETTING_KEYS, id) ? tSettings(id) : id;
    return id.slice(0, 8);
  };
  const changedFields = (metadata: unknown) => {
    const changed = (metadata as { changed?: unknown } | null)?.changed;
    return Array.isArray(changed) ? changed.filter((f): f is string => typeof f === "string").join(", ") : "";
  };

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const pageQuery = (page: number) =>
    Object.fromEntries(Object.entries({ ...filters, page }).filter(([, value]) => value !== undefined));
  const linkClass = "rounded-full border border-border bg-surface px-3 py-1 text-sm text-ink hover:bg-band";
  const field = "rounded-lg border border-border bg-surface px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-primary";

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("intro")}</p>
      </div>

      <form method="get" className="grid gap-4 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto] lg:items-end">
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <label htmlFor="audit-admin">{t("filterAdmin")}</label>
          <select id="audit-admin" name="admin" defaultValue={filters.admin ?? ""} className={field}>
            <option value="">{t("anyAdmin")}</option>
            {(admins ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <label htmlFor="audit-area">{t("filterArea")}</label>
          <select id="audit-area" name="area" defaultValue={filters.area ?? ""} className={field}>
            <option value="">{t("anyArea")}</option>
            {AREAS.map((area) => (
              <option key={area} value={area}>
                {t(`areas.${area}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <label htmlFor="audit-from">{t("from")}</label>
          <input id="audit-from" type="date" name="from" defaultValue={filters.from ?? ""} className={field} />
        </div>
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <label htmlFor="audit-to">{t("to")}</label>
          <input id="audit-to" type="date" name="to" defaultValue={filters.to ?? ""} className={field} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit">{t("filter")}</Button>
          <Link href="/admin/audit" className="text-sm text-primary underline underline-offset-4">
            {t("clear")}
          </Link>
        </div>
      </form>
      <p className="text-sm text-muted">{t("zoneNote", { zone: timeZone })}</p>

      {entries.length === 0 ? (
        <p className="text-muted">{t("empty")}</p>
      ) : (
        // Scrolls on its own on narrow screens; the page never scrolls sideways.
        <div className="relative overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-band text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-start font-medium">{t("colTime")}</th>
                <th scope="col" className="px-4 py-3 text-start font-medium">{t("colAdmin")}</th>
                <th scope="col" className="px-4 py-3 text-start font-medium">{t("colAction")}</th>
                <th scope="col" className="px-4 py-3 text-start font-medium">{t("colTarget")}</th>
                <th scope="col" className="px-4 py-3 text-start font-medium">{t("colDetails")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-border align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    <LocalTime iso={entry.created_at} options={DATE_TIME} />
                  </td>
                  <td className="px-4 py-3">{entry.admin?.display_name ?? ""}</td>
                  <td className="px-4 py-3 font-medium text-ink">{describeAction(entry.action, entry.target_type)}</td>
                  <td className="px-4 py-3" title={entry.target_id ?? undefined}>
                    {describeTarget(entry.target_type, entry.target_id)}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {/* For new rows every column is "changed": only list real changes. */}
                    {entry.action.endsWith(".update") && <span dir="ltr">{changedFields(entry.metadata)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label={t("pagination")} className="flex items-center gap-3">
          {filters.page > 1 && (
            <Link href={{ pathname: "/admin/audit", query: pageQuery(filters.page - 1) }} className={linkClass}>
              {t("previous")}
            </Link>
          )}
          <span className="text-sm text-muted">{t("pageOf", { page: filters.page, total: totalPages })}</span>
          {filters.page < totalPages && (
            <Link href={{ pathname: "/admin/audit", query: pageQuery(filters.page + 1) }} className={linkClass}>
              {t("next")}
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
