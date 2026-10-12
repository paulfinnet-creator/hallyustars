"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type FormEvent } from "react";
import { Button, ErrorMessage, TextField } from "@/components/ui";
import { NATIVE_NAMES, SUPPORTED, type Locale } from "@/i18n/config";
import { useRouter } from "@/i18n/navigation";
import { CATEGORIES, type Category } from "@/lib/celebrities/fields";
import { createCelebrity, updateCelebrity, type CelebrityError } from "./actions";

export type ProfileValues = {
  stageName: string;
  category: Category;
  groupName: string;
  languages: Locale[];
  timezone: string;
  acceptsInvites: boolean;
};

export const NEW_PROFILE: ProfileValues = {
  stageName: "",
  category: "kpop",
  groupName: "",
  languages: ["ko"],
  timezone: "Asia/Seoul",
  acceptsInvites: true,
};

/** Create (no profileId) or edit a celebrity's profile fields. */
export function ProfileForm({
  profileId,
  initial,
  timeZones,
}: {
  profileId?: string;
  initial: ProfileValues;
  timeZones: string[];
}) {
  const t = useTranslations("admin.celebrities");
  const tc = useTranslations("common.categories");
  const router = useRouter();
  const ids = { category: useId(), timezone: useId() };
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<CelebrityError | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) {
    setSaved(false);
    setValues((v) => ({ ...v, [key]: value }));
  }

  function toggleLanguage(locale: Locale) {
    set("languages", values.languages.includes(locale) ? values.languages.filter((l) => l !== locale) : [...values.languages, locale]);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      if (!profileId) {
        const result = await createCelebrity(values);
        if ("error" in result) return setError(result.error);
        router.push(`/admin/celebrities/${result.id}`);
        return;
      }
      const result = await updateCelebrity(profileId, values);
      if ("error" in result) return setError(result.error);
      setSaved(true);
    });
  }

  const selectClass =
    "rounded-lg border border-border bg-surface px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="stage-name"
          label={t("stageName")}
          required
          maxLength={120}
          value={values.stageName}
          onChange={(e) => set("stageName", e.target.value)}
        />
        <TextField
          id="group-name"
          label={t("groupName")}
          hint={t("groupNameHint")}
          maxLength={120}
          value={values.groupName}
          onChange={(e) => set("groupName", e.target.value)}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.category} className="text-sm font-medium">
            {t("category")}
          </label>
          <select
            id={ids.category}
            value={values.category}
            onChange={(e) => set("category", e.target.value as Category)}
            className={selectClass}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {tc(c)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.timezone} className="text-sm font-medium">
            {t("timezone")}
          </label>
          <select
            id={ids.timezone}
            value={values.timezone}
            onChange={(e) => set("timezone", e.target.value)}
            className={selectClass}
            dir="ltr"
          >
            {timeZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t("languages")}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {SUPPORTED.map((locale) => (
            <label key={locale} className="flex items-center gap-1.5 text-sm" lang={locale}>
              <input
                type="checkbox"
                checked={values.languages.includes(locale)}
                onChange={() => toggleLanguage(locale)}
                className="accent-primary"
              />
              {NATIVE_NAMES[locale]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.acceptsInvites}
          onChange={(e) => set("acceptsInvites", e.target.checked)}
          className="accent-primary"
        />
        {t("acceptsInvitesLabel")}
      </label>

      <ErrorMessage>{error ? t(`errors.${error}`) : null}</ErrorMessage>
      {saved && (
        <p role="status" className="text-sm text-primary">
          {t("saved")}
        </p>
      )}
      <Button type="submit" className="self-start" disabled={pending}>
        {profileId ? t("saveProfile") : t("create")}
      </Button>
    </form>
  );
}
