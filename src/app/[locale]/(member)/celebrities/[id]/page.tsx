import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { VerifiedBadge } from "@/components/CelebrityCard";
import { LocalClock } from "@/components/LocalClock";
import { isLocale, NATIVE_NAMES, type Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { requireMemberPage } from "@/lib/auth/viewer";
import { pickBio } from "@/lib/celebrities/bio";
import { displayInvitationStatus } from "@/lib/chat-invitations/status";
import { InviteSection, type InviteState } from "./InviteSection";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CelebrityPage({ params }: PageProps<"/[locale]/celebrities/[id]">) {
  const locale = await rootParams.locale();
  if (!isLocale(locale)) notFound();
  const { supabase, viewer } = await requireMemberPage(locale);
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { data: c, error } = await supabase
    .from("celebrity_profiles")
    .select(
      "id, stage_name, category, group_name, languages, timezone, accepts_invites, photo_url, user_id, bio_source_locale, translations:celebrity_profile_translations(locale, bio, is_machine_translated)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`celebrity query failed: ${error.code}`);
  if (!c) notFound();

  const t = await getTranslations();
  const bio = pickBio(
    c.translations.map((r) => ({ locale: r.locale as Locale, bio: r.bio, isMachine: r.is_machine_translated })),
    locale,
    c.bio_source_locale as Locale | null,
  );
  const openToInvites = c.accepts_invites && c.user_id !== null;
  const invite = viewer.role === "fan" ? await inviteState(supabase, c.id, openToInvites) : null;

  return (
    <main className="flex flex-col gap-6">
      <Link href="/celebrities" className="self-start text-sm text-primary underline underline-offset-4">
        {t("discover.backToList")}
      </Link>

      <div className="grid gap-8 md:grid-cols-[minmax(0,20rem)_1fr]">
        <div className="mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl border-4 border-gold bg-band shadow-md md:max-w-none">
          {c.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL
            <img
              src={c.photo_url}
              alt={t("discover.photoAlt", { name: c.stage_name })}
              width={1200}
              height={1600}
              className="h-full w-full object-cover"
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="flex items-center gap-2 text-4xl font-semibold break-words">
              <span className="min-w-0">{c.stage_name}</span>
              <VerifiedBadge label={t("discover.verified")} className="size-7" />
            </h1>
            <p className="text-lg text-muted">
              {t(`common.categories.${c.category}`)}
              {c.group_name && ` · ${c.group_name}`}
            </p>
            <LocalClock timeZone={c.timezone} />
          </div>

          <p
            className={`self-start rounded-full px-3 py-1 text-sm font-medium ${
              openToInvites ? "bg-primary text-primary-ink" : "border border-border bg-band text-muted"
            }`}
          >
            {openToInvites ? t("discover.invitesOpen") : t("discover.invitesClosed")}
          </p>

          {c.languages.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h2 className="text-sm font-medium text-muted">{t("discover.languages")}</h2>
              <ul className="flex flex-wrap gap-2">
                {(c.languages as Locale[]).map((l) => (
                  <li key={l} lang={l} className="rounded-full border border-border bg-surface px-3 py-1 text-sm">
                    {NATIVE_NAMES[l]}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {invite && (
            <section aria-labelledby="invite-title" className="flex flex-col gap-3 rounded-xl border-2 border-primary/40 bg-surface p-5">
              <h2 id="invite-title" className="text-xl font-semibold">
                {t("invitations.inviteTitle", { name: c.stage_name })}
              </h2>
              <InviteSection celebrityId={c.id} name={c.stage_name} state={invite} />
            </section>
          )}

          <section aria-labelledby="about-title" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
            <h2 id="about-title" className="text-xl font-semibold">
              {t("discover.about")}
            </h2>
            {bio ? (
              <>
                <p lang={bio.shown.locale} className="whitespace-pre-line">
                  {bio.shown.bio}
                </p>
                {bio.original && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted">
                      {t("discover.machineTranslated")}{" "}
                      <span className="text-primary underline underline-offset-4">{t("discover.viewOriginal")}</span>
                    </summary>
                    <p lang={bio.original.locale} className="mt-2 whitespace-pre-line border-s-2 border-gold ps-3">
                      {bio.original.bio}
                    </p>
                  </details>
                )}
              </>
            ) : (
              <p className="text-muted">{t("discover.noBio")}</p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

/**
 * The fan's latest invitation to this star decides what they see: the form,
 * "waiting for review", or "approved". Null hides the box (star not open).
 */
async function inviteState(
  supabase: Awaited<ReturnType<typeof requireMemberPage>>["supabase"],
  celebrityId: string,
  openToInvites: boolean,
): Promise<InviteState | null> {
  const { data: latest, error } = await supabase
    .from("chat_invitations")
    .select("id, status, expires_at, created_at, reason, conversation:conversations(id)")
    .eq("celebrity_id", celebrityId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`invitation query failed: ${error.code}`);

  const status = latest ? displayInvitationStatus(latest.status, latest.expires_at, new Date()) : null;
  if (latest && status === "approved") return { kind: "approved", conversationId: latest.conversation?.id ?? null };
  if (latest && status === "pending") {
    return { kind: "waiting", invitationId: latest.id, sentAt: latest.created_at, expiresAt: latest.expires_at };
  }
  if (!openToInvites) return null;
  return {
    kind: "form",
    previous:
      latest && (status === "rejected" || status === "expired" || status === "withdrawn")
        ? { status, reason: status === "rejected" ? latest.reason : null }
        : null,
  };
}
