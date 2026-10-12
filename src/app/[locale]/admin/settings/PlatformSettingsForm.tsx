"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Button, ErrorMessage, TextField } from "@/components/ui";
import { PLATFORM_SETTINGS, type PlatformSettingValues } from "@/lib/settings/platform";
import { saveSettings, type SettingsError } from "./actions";

export function PlatformSettingsForm({ values }: { values: PlatformSettingValues }) {
  const t = useTranslations("admin.settings");
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])),
  );
  const [error, setError] = useState<SettingsError | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const next = Object.fromEntries(PLATFORM_SETTINGS.map(({ key }) => [key, Number(draft[key])])) as PlatformSettingValues;
    startTransition(async () => {
      const result = await saveSettings(next);
      if (!result.ok) return setError(result.error);
      setSaved(true);
    });
  }

  return (
    <section aria-labelledby="platform-title" className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <div>
        <h2 id="platform-title" className="text-xl font-semibold">
          {t("platformTitle")}
        </h2>
        <p className="text-sm text-muted">{t("platformHint")}</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {PLATFORM_SETTINGS.map(({ key, unit, min, max }) => (
            <TextField
              key={key}
              id={`setting-${key}`}
              label={t(`fields.${key}`)}
              hint={t(`units.${unit}`, { min, max })}
              type="number"
              inputMode="numeric"
              required
              min={min}
              max={max}
              step={1}
              value={draft[key] ?? ""}
              onChange={(e) => {
                setSaved(false);
                setDraft((d) => ({ ...d, [key]: e.target.value }));
              }}
            />
          ))}
        </div>
        <ErrorMessage>{error ? t(`errors.${error}`) : null}</ErrorMessage>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {t("save")}
          </Button>
          {saved && (
            <p role="status" className="text-sm text-primary">
              {t("saved")}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
