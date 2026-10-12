import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/LocalTime";
import { isLocale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { requireAdminPage } from "@/lib/auth/viewer";

const DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

export default async function VerificationQueuePage({ searchParams }: PageProps<"/[locale]/admin/verifications">) {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  const { supabase } = await requireAdminPage(locale);
  const t = await getTranslations("admin.verifications");
  const tId = await getTranslations("register.idTypes");
  const { done } = await searchParams;

  // Oldest first. No images here: the ID is only opened (and logged) on the review page.
  const { data, error } = await supabase
    .from("verifications")
    .select("id, kind, id_document_type, created_at, fan:users!verifications_user_id_fkey(display_name)")
    .eq("status", "pending")
    .order("created_at")
    .limit(200);
  if (error) throw new Error(`verification queue query failed: ${error.code}`);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("pendingCount", { count: data.length })}</p>
      </div>
      {done === "1" && (
        <p role="status" className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
          {t("decisionSaved")}
        </p>
      )}

      {data.length === 0 ? (
        <p className="text-muted">{t("empty")}</p>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-band text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-start font-medium">{t("colFan")}</th>
                <th scope="col" className="px-4 py-3 text-start font-medium">{t("colKind")}</th>
                <th scope="col" className="px-4 py-3 text-start font-medium">{t("colDocument")}</th>
                <th scope="col" className="px-4 py-3 text-start font-medium">{t("colSubmitted")}</th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  <span className="sr-only">{t("colAction")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((v) => {
                const name = v.fan?.display_name ?? "";
                return (
                  <tr key={v.id} className="border-t border-border">
                    <th scope="row" className="px-4 py-3 text-start font-medium">{name}</th>
                    <td className="px-4 py-3">{t(`kinds.${v.kind}`)}</td>
                    <td className="px-4 py-3 text-muted">{v.id_document_type ? tId(v.id_document_type) : "—"}</td>
                    <td className="px-4 py-3 text-muted">
                      <LocalTime iso={v.created_at} options={DATE_TIME} />
                    </td>
                    <td className="px-4 py-3">
                      {/* No prefetch: opening a review is what reveals (and logs) the ID. */}
                      <Link
                        href={`/admin/verifications/${v.id}`}
                        prefetch={false}
                        aria-label={t("reviewLabel", { name })}
                        className="rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink hover:opacity-90"
                      >
                        {t("review")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
