"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Button, ErrorMessage, TextField } from "@/components/ui";
import { createLoginAccount, type CelebrityError } from "../actions";

/** The celebrity's own login (email code sign-in), created by an admin. */
export function AccountSection({ profileId, linkedName }: { profileId: string; linkedName: string | null }) {
  const t = useTranslations("admin.celebrities");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<CelebrityError | null>(null);
  const [pending, startTransition] = useTransition();

  if (linkedName) {
    return <p className="text-sm">{t("accountLinked", { name: linkedName })}</p>;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createLoginAccount({ profileId, email });
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t("accountIntro")}</p>
      <div className="max-w-md">
        <TextField
          id="celebrity-email"
          label={t("accountEmail")}
          type="email"
          dir="ltr"
          autoComplete="off"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <ErrorMessage>{error ? t(`errors.${error}`) : null}</ErrorMessage>
      <Button type="submit" className="self-start" disabled={pending}>
        {t("createAccount")}
      </Button>
    </form>
  );
}
