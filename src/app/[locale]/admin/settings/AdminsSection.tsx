"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { LocalTime } from "@/components/LocalTime";
import { Button, ErrorMessage, TextField } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { addAdmin, resetAuthenticator, setAdminAccess, type SettingsError } from "./actions";

export type AdminRow = {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  hasAuthenticator: boolean;
};

const DATE: Intl.DateTimeFormatOptions = { dateStyle: "medium" };

export function AdminsSection({ viewerId, admins }: { viewerId: string; admins: AdminRow[] }) {
  const t = useTranslations("admin.settings");
  const [error, setError] = useState<SettingsError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <section aria-labelledby="admins-title" className="flex flex-col gap-4">
      <h2 id="admins-title" className="text-xl font-semibold">
        {t("adminsTitle")}
      </h2>
      <AddAdminForm
        onAdded={(name) => {
          setError(null);
          setNotice(t("added", { name }));
        }}
      />
      <ErrorMessage>{error ? t(`errors.${error}`) : null}</ErrorMessage>
      {notice && (
        <p role="status" className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-ink">
          {notice}
        </p>
      )}
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
        {admins.map((admin) => (
          <li key={admin.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium text-ink">
                {admin.name}
                {admin.id === viewerId && <span className="ms-2 text-sm font-normal text-muted">{t("you")}</span>}
              </span>
              <span className="text-sm text-muted">
                {t("since")} <LocalTime iso={admin.createdAt} options={DATE} />
                {" · "}
                {admin.active ? (admin.hasAuthenticator ? t("authenticatorSet") : t("authenticatorNotSet")) : t("removed")}
              </span>
            </div>
            {admin.id !== viewerId && (
              <AdminActions
                admin={admin}
                onDone={(message) => {
                  setError(null);
                  setNotice(message);
                }}
                onError={(e) => {
                  setNotice(null);
                  setError(e);
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AddAdminForm({ onAdded }: { onAdded: (name: string) => void }) {
  const t = useTranslations("admin.settings");
  const locale = useLocale() as Locale;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<SettingsError | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addAdmin({ name, email, locale });
      if (!result.ok) return setError(result.error);
      onAdded(name.trim());
      setName("");
      setEmail("");
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-1 text-lg font-semibold">{t("addTitle")}</h3>
      <p className="mb-4 text-sm text-muted">{t("addHint")}</p>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <TextField
          id="admin-name"
          label={t("name")}
          autoComplete="off"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          id="admin-email"
          label={t("email")}
          type="email"
          autoComplete="off"
          dir="ltr"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" disabled={pending}>
          {t("add")}
        </Button>
      </form>
      <div className="mt-4">
        <ErrorMessage>{error ? t(`errors.${error}`) : null}</ErrorMessage>
      </div>
    </div>
  );
}

type Confirming = "remove" | "reset" | null;

function AdminActions({
  admin,
  onDone,
  onError,
}: {
  admin: AdminRow;
  onDone: (message: string) => void;
  onError: (error: SettingsError) => void;
}) {
  const t = useTranslations("admin.settings");
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: SettingsError }>, message: string) {
    startTransition(async () => {
      const result = await action();
      setConfirming(null);
      if (result.ok) onDone(message);
      else onError(result.error);
    });
  }

  // Removing access and resetting the authenticator take a second, explicit click.
  if (confirming) {
    const remove = confirming === "remove";
    return (
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t(remove ? "confirmRemoveLabel" : "confirmResetLabel", { name: admin.name })}
      >
        <span className="text-sm text-ink">
          {t(remove ? "confirmRemoveLabel" : "confirmResetLabel", { name: admin.name })}
        </span>
        <Button
          variant="danger"
          disabled={pending}
          onClick={() =>
            remove
              ? run(() => setAdminAccess({ userId: admin.id, active: false }), t("removedNotice", { name: admin.name }))
              : run(() => resetAuthenticator({ userId: admin.id }), t("resetNotice", { name: admin.name }))
          }
        >
          {t(remove ? "confirmRemove" : "confirmReset")}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => setConfirming(null)}>
          {t("cancel")}
        </Button>
      </div>
    );
  }

  if (!admin.active) {
    return (
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => run(() => setAdminAccess({ userId: admin.id, active: true }), t("restoredNotice", { name: admin.name }))}
        aria-label={t("restoreLabel", { name: admin.name })}
      >
        {t("restore")}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {admin.hasAuthenticator && (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => setConfirming("reset")}
          aria-label={t("resetLabel", { name: admin.name })}
        >
          {t("reset")}
        </Button>
      )}
      <Button
        variant="danger"
        disabled={pending}
        onClick={() => setConfirming("remove")}
        aria-label={t("removeLabel", { name: admin.name })}
      >
        {t("remove")}
      </Button>
    </div>
  );
}
