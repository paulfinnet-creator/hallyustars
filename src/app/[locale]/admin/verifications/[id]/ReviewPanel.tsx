"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Button, ErrorMessage } from "@/components/ui";
import { useRouter } from "@/i18n/navigation";
import { decideVerification, revealIdDocument, type ReviewError } from "../actions";

export function ReviewPanel({
  verificationId,
  name,
  pending,
  photoUrl,
  photoChange,
  currentPhotoUrl,
  idVerificationId,
}: {
  verificationId: string;
  name: string;
  pending: boolean;
  photoUrl: string | null;
  /** A new profile photo from an approved fan (not a registration). */
  photoChange: boolean;
  currentPhotoUrl: string | null;
  /** The verification whose ID image to show (a photo change uses the registration's). */
  idVerificationId: string | null;
}) {
  const t = useTranslations("admin.verifications");
  const router = useRouter();
  const reasonId = useId();
  const [idUrl, setIdUrl] = useState<string | null>(null);
  const [idError, setIdError] = useState<ReviewError | null>(idVerificationId ? null : "unavailable");
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<ReviewError | null>(null);
  const [busy, startTransition] = useTransition();

  // The ID is fetched only once this page is actually shown; that fetch is
  // what gets audited. The ref keeps it to one request (and one audit row)
  // even when React runs effects twice in development.
  const requestedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!idVerificationId || requestedFor.current === idVerificationId) return;
    requestedFor.current = idVerificationId;
    revealIdDocument(idVerificationId).then((result) => {
      if ("error" in result) setIdError(result.error);
      else setIdUrl(result.url);
    });
  }, [idVerificationId]);

  function decide(approve: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await decideVerification({ verificationId, approve, reason: approve ? undefined : reason });
      if ("error" in result) {
        setConfirming(false);
        return setError(result.error);
      }
      router.replace(result.nextId ? `/admin/verifications/${result.nextId}` : "/admin/verifications?done=1");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">{t(photoChange ? "photoChangeHint" : "compareHint")}</p>
      <div className={`grid gap-4 ${photoChange ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        <figure className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
          <figcaption className="text-sm font-medium">{t(photoChange ? "newPhoto" : "profilePhoto")}</figcaption>
          {photoUrl ? (
            <a href={photoUrl} target="_blank" rel="noreferrer" className="self-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
              <img src={photoUrl} alt={t("profilePhotoAlt", { name })} className="h-auto max-h-[28rem] w-auto max-w-full rounded-lg" />
            </a>
          ) : (
            <p className="text-muted">{t("photoUnavailable")}</p>
          )}
        </figure>
        {photoChange && (
          <figure className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
            <figcaption className="text-sm font-medium">{t("currentPhoto")}</figcaption>
            {currentPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- public avatar URL
              <img src={currentPhotoUrl} alt={t("currentPhotoAlt", { name })} className="h-auto max-h-[28rem] w-auto max-w-full self-center rounded-lg" />
            ) : (
              <p className="text-muted">{t("photoUnavailable")}</p>
            )}
          </figure>
        )}
        <figure className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
          <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-medium">
            {t("idDocument")}
            <span className="text-xs font-normal text-muted">{t("idViewLogged")}</span>
          </figcaption>
          {idUrl ? (
            <a href={idUrl} target="_blank" rel="noreferrer" className="self-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
              <img src={idUrl} alt={t("idDocumentAlt", { name })} className="h-auto max-h-[28rem] w-auto max-w-full rounded-lg" />
            </a>
          ) : idError ? (
            <p className="text-muted">{t(idError === "forbidden" ? "errors.forbidden" : "idUnavailable")}</p>
          ) : (
            <p role="status" className="text-muted">
              {t("loadingId")}
            </p>
          )}
        </figure>
      </div>

      <ErrorMessage>{error ? t(`errors.${error}`) : null}</ErrorMessage>

      {pending ? (
        <div className="grid gap-4 md:grid-cols-2">
          <section aria-labelledby="approve-title" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
            <h2 id="approve-title" className="text-lg font-semibold">
              {t("approve")}
            </h2>
            <p className="text-sm text-muted">{t(photoChange ? "approvePhotoHint" : "approveHint")}</p>
            {confirming ? (
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => decide(true)}>
                  {t("confirmApprove", { name })}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
                  {t("cancel")}
                </Button>
              </div>
            ) : (
              <Button className="self-start" disabled={busy} onClick={() => setConfirming(true)}>
                {t("approve")}
              </Button>
            )}
          </section>
          <section aria-labelledby="reject-title" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
            <h2 id="reject-title" className="text-lg font-semibold">
              {t("reject")}
            </h2>
            <label htmlFor={reasonId} className="text-sm text-muted">
              {t("rejectReason")}
            </label>
            <textarea
              id={reasonId}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-primary"
            />
            <Button
              variant="danger"
              className="self-start"
              disabled={busy}
              onClick={() => (reason.trim() ? decide(false) : setError("reasonRequired"))}
            >
              {t("reject")}
            </Button>
          </section>
        </div>
      ) : (
        <p role="status" className="text-muted">
          {t("alreadyDecided")}
        </p>
      )}
    </div>
  );
}
