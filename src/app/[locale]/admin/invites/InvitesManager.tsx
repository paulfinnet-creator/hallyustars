"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { CopyButton } from "@/components/CopyButton";
import { LocalTime } from "@/components/LocalTime";
import { Button, ErrorMessage, TextField } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { canChangeInvite, type InviteStatus } from "@/lib/invites/status";
import {
  createInvite,
  regenerateInviteCode,
  revokeInvite,
  type InviteError,
  type IssuedInvite,
} from "./actions";

export type InviteRow = {
  id: string;
  fanName: string;
  status: InviteStatus;
  expiresAt: string;
  createdAt: string;
  createdBy: string;
};

const DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

const STATUS_STYLE: Record<InviteStatus, string> = {
  created: "border-primary/40 text-primary",
  registering: "border-gold/60 text-ink",
  pending_review: "border-gold/60 text-ink",
  approved: "border-primary bg-primary text-primary-ink",
  rejected: "border-accent/50 text-accent",
  expired: "border-border text-muted",
  revoked: "border-border text-muted line-through",
};

export function InvitesManager({
  rows,
  page,
  totalPages,
}: {
  rows: InviteRow[];
  page: number;
  totalPages: number;
}) {
  const t = useTranslations("admin.invites");
  const [issued, setIssued] = useState<IssuedInvite | null>(null);
  const [rowError, setRowError] = useState<InviteError | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <CreateInviteForm onIssued={setIssued} />
      {issued && <IssuedPanel invite={issued} onDismiss={() => setIssued(null)} />}

      <section aria-labelledby="invites-table-title" className="flex flex-col gap-4">
        <h2 id="invites-table-title" className="text-xl font-semibold">
          {t("tableTitle")}
        </h2>
        <ErrorMessage>{rowError ? t(`errors.${rowError}`) : null}</ErrorMessage>
        {rows.length === 0 ? (
          <p className="text-muted">{t("empty")}</p>
        ) : (
          // Scrolls on its own on narrow screens; the page never scrolls sideways.
          <div className="relative overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-band text-start text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 text-start font-medium">{t("colName")}</th>
                  <th scope="col" className="px-4 py-3 text-start font-medium">{t("colStatus")}</th>
                  <th scope="col" className="px-4 py-3 text-start font-medium">{t("colCreatedBy")}</th>
                  <th scope="col" className="px-4 py-3 text-start font-medium">{t("colExpires")}</th>
                  <th scope="col" className="px-4 py-3 text-start font-medium">{t("colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <th scope="row" className="px-4 py-3 text-start font-medium text-ink">
                      {row.fanName}
                    </th>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[row.status]}`}>
                        {t(`status.${row.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      <div>{row.createdBy}</div>
                      <div className="text-xs">
                        <LocalTime iso={row.createdAt} options={DATE_TIME} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      <LocalTime iso={row.expiresAt} options={DATE_TIME} />
                    </td>
                    <td className="px-4 py-3">
                      {canChangeInvite(row.status) && (
                        <RowActions
                          row={row}
                          onIssued={(invite) => {
                            setRowError(null);
                            setIssued(invite);
                          }}
                          onError={setRowError}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && <Pagination page={page} totalPages={totalPages} />}
      </section>
    </div>
  );
}

function CreateInviteForm({ onIssued }: { onIssued: (invite: IssuedInvite) => void }) {
  const t = useTranslations("admin.invites");
  const [fanName, setFanName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<InviteError | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createInvite({ fanName, email });
      if (!result.ok) return setError(result.error);
      setFanName("");
      setEmail("");
      onIssued(result.invite);
    });
  }

  return (
    <section
      aria-labelledby="create-invite-title"
      className="rounded-xl border border-border bg-surface p-5"
    >
      <h2 id="create-invite-title" className="mb-4 text-xl font-semibold">
        {t("createTitle")}
      </h2>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <TextField
          id="fan-name"
          label={t("fanName")}
          autoComplete="off"
          required
          maxLength={120}
          value={fanName}
          onChange={(e) => setFanName(e.target.value)}
        />
        <TextField
          id="fan-email"
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
          {t("create")}
        </Button>
      </form>
      <div className="mt-4">
        <ErrorMessage>{error ? t(`errors.${error}`) : null}</ErrorMessage>
      </div>
    </section>
  );
}

function IssuedPanel({ invite, onDismiss }: { invite: IssuedInvite; onDismiss: () => void }) {
  const t = useTranslations("admin.invites");
  const ref = useRef<HTMLElement>(null);

  // Bring the new code into view (and to screen readers' attention) whenever one is issued.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    ref.current?.focus();
  }, [invite]);

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby="issued-title"
      data-testid="issued-invite"
      className="flex flex-col gap-4 rounded-xl border-2 border-primary bg-surface p-5 focus:outline-none"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="issued-title" className="text-xl font-semibold">
            {t(invite.kind === "created" ? "createdTitle" : "regeneratedTitle", { name: invite.fanName })}
          </h2>
          <p className="text-sm text-muted">{t("shareHint")}</p>
        </div>
        <Button variant="secondary" onClick={onDismiss}>
          {t("done")}
        </Button>
      </div>

      <dl className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <dt className="text-sm font-medium text-muted">{t("codeLabel")}</dt>
          <dd className="flex flex-wrap items-center gap-3">
            <code dir="ltr" data-testid="issued-code" className="rounded-md bg-band px-3 py-1.5 font-mono text-lg tracking-wider text-ink select-all">
              {invite.code}
            </code>
            <CopyButton value={invite.code} label={t("copyCode")} />
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm font-medium text-muted">{t("linkLabel")}</dt>
          <dd className="flex flex-wrap items-center gap-3">
            <code dir="ltr" data-testid="issued-link" className="min-w-0 rounded-md bg-band px-3 py-1.5 font-mono text-sm break-all text-ink select-all">
              {invite.link}
            </code>
            <CopyButton value={invite.link} label={t("copyLink")} />
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm font-medium text-muted">{t("colExpires")}</dt>
          <dd className="text-ink">
            <LocalTime iso={invite.expiresAt} options={DATE_TIME} />
          </dd>
        </div>
      </dl>
    </section>
  );
}

function RowActions({
  row,
  onIssued,
  onError,
}: {
  row: InviteRow;
  onIssued: (invite: IssuedInvite) => void;
  onError: (error: InviteError) => void;
}) {
  const t = useTranslations("admin.invites");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function regenerate() {
    startTransition(async () => {
      const result = await regenerateInviteCode(row.id);
      if (!result.ok) return onError(result.error);
      onIssued(result.invite);
    });
  }

  function revoke() {
    startTransition(async () => {
      const result = await revokeInvite(row.id);
      setConfirming(false);
      if (!result.ok) onError(result.error);
    });
  }

  // Revoking can't be undone, so it takes a second, explicit click.
  if (confirming) {
    return (
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("confirmRevokeLabel", { name: row.fanName })}>
        <Button variant="danger" disabled={pending} onClick={revoke}>
          {t("confirmRevoke")}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>
          {t("cancel")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={regenerate}
        aria-label={t("regenerateLabel", { name: row.fanName })}
      >
        {t("regenerate")}
      </Button>
      <Button
        variant="danger"
        disabled={pending}
        onClick={() => setConfirming(true)}
        aria-label={t("revokeLabel", { name: row.fanName })}
      >
        {t("revoke")}
      </Button>
    </div>
  );
}

function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const t = useTranslations("admin.invites");
  const linkClass = "rounded-full border border-border bg-surface px-3 py-1 text-sm text-ink hover:bg-band";
  return (
    <nav aria-label={t("pagination")} className="flex items-center gap-3">
      {page > 1 && (
        <Link href={{ pathname: "/admin/invites", query: { page: page - 1 } }} className={linkClass}>
          {t("previous")}
        </Link>
      )}
      <span className="text-sm text-muted">{t("pageOf", { page, total: totalPages })}</span>
      {page < totalPages && (
        <Link href={{ pathname: "/admin/invites", query: { page: page + 1 } }} className={linkClass}>
          {t("next")}
        </Link>
      )}
    </nav>
  );
}
