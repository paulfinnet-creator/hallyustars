import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isLocale } from "@/i18n/config";
import { countriesFromTimezones } from "@/lib/analytics/countries";
import { requireAdminPage } from "@/lib/auth/viewer";
import { formatDuration } from "@/lib/time/format";

type Analytics = {
  invites: { created: number; created30: number; used: number; used30: number; open: number; expired: number };
  fans: { approved: number; approved30: number; pendingReview: number; registering: number; rejected: number; suspended: number };
  celebrities: { profiles: number; withLogin: number; open: number };
  chatInvitations: { sent: number; sent30: number; waiting: number; approved: number; rejected: number };
  chats: { open: number; active7: number };
  responseSeconds: { verification: number | null; chatInvitation: number | null; celebrityReply: number | null };
  fanTimezones: { timezone: string; count: number }[];
};

export async function generateMetadata() {
  const t = await getTranslations("admin.analytics");
  return { title: t("title") };
}

/** Headline numbers for the agency. Counts and medians only. */
export default async function AnalyticsPage() {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  const { supabase } = await requireAdminPage(locale);
  const t = await getTranslations("admin.analytics");

  const { data, error } = await supabase.rpc("admin_analytics");
  if (error) throw new Error(`analytics query failed: ${error.code}`);
  const a = data as unknown as Analytics;

  const number = new Intl.NumberFormat(locale);
  const last30 = (count: number) => t("last30", { count });
  const duration = (seconds: number | null) => (seconds === null ? null : formatDuration(seconds, locale));

  const { countries, other, unknown } = countriesFromTimezones(a.fanTimezones);
  const regionNames = new Intl.DisplayNames([locale], { type: "region" });
  const countryRows = [
    ...countries.map((c) => ({ key: c.code!, name: regionNames.of(c.code!) ?? c.code!, count: c.count })),
    ...(other ? [{ key: "other", name: t("otherCountries"), count: other }] : []),
    ...(unknown ? [{ key: "unknown", name: t("unknownCountry"), count: unknown }] : []),
  ];
  const max = Math.max(1, ...countryRows.map((row) => row.count));

  return (
    <main className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("intro")}</p>
      </div>

      <Section title={t("invitesTitle")}>
        <Tile label={t("invitesCreated")} value={number.format(a.invites.created)} note={last30(a.invites.created30)} />
        <Tile label={t("invitesUsed")} value={number.format(a.invites.used)} note={last30(a.invites.used30)} />
        <Tile label={t("invitesOpen")} value={number.format(a.invites.open)} />
        <Tile label={t("invitesExpired")} value={number.format(a.invites.expired)} />
      </Section>

      <Section title={t("fansTitle")}>
        <Tile label={t("fansApproved")} value={number.format(a.fans.approved)} note={last30(a.fans.approved30)} />
        <Tile label={t("fansPendingReview")} value={number.format(a.fans.pendingReview)} />
        <Tile label={t("fansRegistering")} value={number.format(a.fans.registering)} />
        <Tile label={t("fansRejected")} value={number.format(a.fans.rejected)} />
        <Tile label={t("fansSuspended")} value={number.format(a.fans.suspended)} />
      </Section>

      <Section title={t("chatsTitle")}>
        <Tile label={t("invitationsSent")} value={number.format(a.chatInvitations.sent)} note={last30(a.chatInvitations.sent30)} />
        <Tile label={t("invitationsWaiting")} value={number.format(a.chatInvitations.waiting)} />
        <Tile label={t("invitationsApproved")} value={number.format(a.chatInvitations.approved)} />
        <Tile label={t("invitationsRejected")} value={number.format(a.chatInvitations.rejected)} />
        <Tile label={t("chatsOpen")} value={number.format(a.chats.open)} />
        <Tile label={t("chatsActive")} value={number.format(a.chats.active7)} />
      </Section>

      <Section title={t("celebritiesTitle")}>
        <Tile label={t("celebrityProfiles")} value={number.format(a.celebrities.profiles)} />
        <Tile label={t("celebritiesWithLogin")} value={number.format(a.celebrities.withLogin)} />
        <Tile label={t("celebritiesOpen")} value={number.format(a.celebrities.open)} />
      </Section>

      <Section title={t("responseTitle")} hint={t("responseHint")}>
        <Tile label={t("responseVerification")} value={duration(a.responseSeconds.verification) ?? t("noData")} />
        <Tile label={t("responseChatInvitation")} value={duration(a.responseSeconds.chatInvitation) ?? t("noData")} />
        <Tile label={t("responseCelebrityReply")} value={duration(a.responseSeconds.celebrityReply) ?? t("noData")} />
      </Section>

      <section aria-labelledby="countries-title" className="flex flex-col gap-3">
        <div>
          <h2 id="countries-title" className="text-xl font-semibold">
            {t("countriesTitle")}
          </h2>
          <p className="text-sm text-muted">{t("countriesHint")}</p>
        </div>
        {countryRows.length === 0 ? (
          <p className="text-muted">{t("noFans")}</p>
        ) : (
          // One series, so one colour and no legend; each bar carries its value.
          <ol className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
            {countryRows.map((row) => (
              <li
                key={row.key}
                className="grid grid-cols-[minmax(6rem,10rem)_1fr] items-center gap-3 text-sm"
                title={t("countryLabel", { country: row.name, count: row.count })}
              >
                <span className="truncate text-ink">{row.name}</span>
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-4 rounded-e bg-primary"
                    style={{ width: `${Math.max(2, (row.count / max) * 85)}%` }}
                  />
                  <span className="text-ink tabular-nums">
                    <span className="sr-only">{t("countryLabel", { country: row.name, count: row.count })}</span>
                    <span aria-hidden="true">{number.format(row.count)}</span>
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{children}</dl>
    </section>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-2xl font-semibold text-ink">{value}</dd>
      {note && <dd className="text-xs text-muted">{note}</dd>}
    </div>
  );
}
