"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type FormEvent } from "react";
import { Button, ErrorMessage } from "@/components/ui";
import { NATIVE_NAMES, SUPPORTED, type Locale } from "@/i18n/config";
import { retranslateBio, saveBio, saveTranslation, type CelebrityError, type TranslationOutcome } from "../actions";

export type BioRow = { locale: Locale; bio: string; isMachine: boolean; updatedAt: string };

const textareaClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";

/**
 * The original bio (Korean or English) and its translations. Saving the
 * original machine-translates the others; any translation can be edited.
 */
export function BioSection({
  profileId,
  sourceLocale,
  bioUpdatedAt,
  rows,
  translationConfigured,
}: {
  profileId: string;
  sourceLocale: "ko" | "en" | null;
  bioUpdatedAt: string | null;
  rows: BioRow[];
  translationConfigured: boolean;
}) {
  const t = useTranslations("admin.celebrities");
  const bioId = useId();
  const byLocale = new Map(rows.map((r) => [r.locale, r]));
  const [source, setSource] = useState<"ko" | "en">(sourceLocale ?? "ko");
  const [original, setOriginal] = useState(byLocale.get(sourceLocale ?? "ko")?.bio ?? "");
  const [overwrite, setOverwrite] = useState(false);
  const [outcome, setOutcome] = useState<TranslationOutcome | null>(null);
  const [error, setError] = useState<CelebrityError | null>(null);
  const [pending, startTransition] = useTransition();

  function report(result: TranslationOutcome | { error: CelebrityError }) {
    if ("error" in result) setError(result.error);
    else setOutcome(result);
  }

  function submitOriginal(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setOutcome(null);
    startTransition(async () => report(await saveBio({ profileId, sourceLocale: source, bio: original })));
  }

  function translateAgain() {
    setError(null);
    setOutcome(null);
    startTransition(async () => report(await retranslateBio({ profileId, overwriteEdited: overwrite })));
  }

  const savedSource = sourceLocale;
  const others = SUPPORTED.filter((l) => l !== savedSource);

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submitOriginal} className="flex flex-col gap-3">
        <fieldset className="flex flex-wrap items-center gap-4">
          <legend className="mb-1 text-sm font-medium">{t("bioSource")}</legend>
          {(["ko", "en"] as const).map((l) => (
            <label key={l} className="flex items-center gap-1.5 text-sm">
              <input type="radio" name="bio-source" checked={source === l} onChange={() => setSource(l)} className="accent-primary" />
              {NATIVE_NAMES[l]}
            </label>
          ))}
        </fieldset>
        <label htmlFor={bioId} className="text-sm font-medium">
          {t("bioOriginal")}
        </label>
        <textarea
          id={bioId}
          rows={5}
          maxLength={4000}
          required
          lang={source}
          value={original}
          onChange={(e) => setOriginal(e.target.value)}
          className={textareaClass}
        />
        <p className="text-sm text-muted">{translationConfigured ? t("bioAutoTranslate") : t("translationNotConfigured")}</p>
        <Button type="submit" className="self-start" disabled={pending}>
          {pending ? t("saving") : t("saveBio")}
        </Button>
      </form>

      <ErrorMessage>{error ? t(`errors.${error}`) : null}</ErrorMessage>
      {outcome && (
        <p role="status" className="text-sm">
          {!outcome.configured
            ? t("bioSavedNoTranslation")
            : outcome.failed
              ? t("translationPartial", { translated: outcome.translated, failed: outcome.failed })
              : t("translationDone", { count: outcome.translated })}
        </p>
      )}

      {savedSource && (
        <section aria-labelledby="translations-title" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h3 id="translations-title" className="text-lg font-semibold">
              {t("translations")}
            </h3>
            {translationConfigured && (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="accent-primary" />
                  {t("overwriteEdited")}
                </label>
                <Button variant="secondary" disabled={pending} onClick={translateAgain}>
                  {t("translateAgain")}
                </Button>
              </div>
            )}
          </div>
          <ul className="flex flex-col gap-4">
            {others.map((locale) => {
              const row = byLocale.get(locale);
              return (
                <TranslationRow
                  // Reset the field whenever the saved text changes (e.g. after re-translating).
                  key={`${locale}:${row?.updatedAt ?? "none"}`}
                  profileId={profileId}
                  locale={locale}
                  row={row}
                  outdated={!!row && !row.isMachine && !!bioUpdatedAt && row.updatedAt < bioUpdatedAt}
                />
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function TranslationRow({
  profileId,
  locale,
  row,
  outdated,
}: {
  profileId: string;
  locale: Locale;
  row: BioRow | undefined;
  outdated: boolean;
}) {
  const t = useTranslations("admin.celebrities");
  const id = useId();
  const [bio, setBio] = useState(row?.bio ?? "");
  const [error, setError] = useState<CelebrityError | null>(null);
  const [pending, startTransition] = useTransition();
  const changed = bio !== (row?.bio ?? "");

  const badge = !row ? t("badgeMissing") : outdated ? t("badgeOutdated") : row.isMachine ? t("badgeMachine") : t("badgeEdited");
  const badgeClass = !row || outdated ? "border-accent/50 text-accent" : row.isMachine ? "border-border text-muted" : "border-primary/50 text-primary";

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveTranslation({ profileId, locale, bio });
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-sm font-medium" lang={locale}>
          {NATIVE_NAMES[locale]}
        </label>
        <span className={`rounded-full border px-2 py-0.5 text-xs ${badgeClass}`}>{badge}</span>
      </div>
      <textarea
        id={id}
        rows={3}
        maxLength={4000}
        lang={locale}
        dir={locale === "ar" ? "rtl" : "ltr"}
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        className={textareaClass}
      />
      <ErrorMessage>{error ? t(`errors.${error}`) : null}</ErrorMessage>
      {changed && (
        <Button variant="secondary" className="self-start" disabled={pending} onClick={save}>
          {t("saveTranslation", { language: NATIVE_NAMES[locale] })}
        </Button>
      )}
    </li>
  );
}
