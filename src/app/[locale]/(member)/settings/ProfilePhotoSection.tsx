"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition, type ChangeEvent } from "react";
import { PhotoCropper } from "@/components/PhotoCropper";
import { ErrorMessage } from "@/components/ui";
import { ACCEPT_ATTRIBUTE, MAX_UPLOAD_BYTES, photoKind } from "@/lib/images/rules";
import { uploadWithTicket } from "@/lib/images/upload";
import { createPhotoUpload, processNewPhoto, type PhotoError } from "./actions";

type FileError = "wrongType" | "tooLarge";

function upload(blob: Blob, format: "jpg" | "heic") {
  return uploadWithTicket<PhotoError>(blob, format, createPhotoUpload);
}

/**
 * An approved fan changes their profile photo. The new one waits for admin
 * review; the current one stays until it's approved.
 */
export function ProfilePhotoSection({
  currentUrl,
  pendingUrl: initialPendingUrl,
  rejectedReason,
}: {
  currentUrl: string | null;
  pendingUrl: string | null;
  rejectedReason: string | null;
}) {
  const t = useTranslations("settings.photo");
  const tRegister = useTranslations("register");
  const [pendingUrl, setPendingUrl] = useState(initialPendingUrl);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [error, setError] = useState<PhotoError | FileError | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, startTransition] = useTransition();
  const inputId = useId();

  // Free the object URL of a photo once the crop tool is done with it.
  useEffect(() => {
    if (!cropSrc?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(cropSrc);
  }, [cropSrc]);

  function onChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setSent(false);
    if (!photoKind(file)) return setError("wrongType");
    if (file.size > MAX_UPLOAD_BYTES) return setError("tooLarge");

    if (photoKind(file) !== "heic") return setCropSrc(URL.createObjectURL(file));
    // Most browsers can't show HEIC: convert it on the server first, then crop.
    startTransition(async () => {
      const uploaded = await upload(file, "heic");
      if ("error" in uploaded) return setError(uploaded.error);
      const result = await processNewPhoto({ purpose: "source", path: uploaded.path });
      if ("error" in result) return setError(result.error);
      const response = await fetch(result.previewUrl);
      setCropSrc(URL.createObjectURL(await response.blob()));
    });
  }

  function onCropped(photo: Blob) {
    setError(null);
    startTransition(async () => {
      const uploaded = await upload(photo, "jpg");
      if ("error" in uploaded) return setError(uploaded.error);
      const result = await processNewPhoto({ purpose: "profile", path: uploaded.path });
      if ("error" in result) return setError(result.error);
      setPendingUrl(result.previewUrl);
      setCropSrc(null);
      setSent(true);
    });
  }

  const pickerClass =
    "inline-flex cursor-pointer items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-ink hover:opacity-90 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary";

  return (
    <section aria-labelledby="photo-title" className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <div>
        <h2 id="photo-title" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-muted">{t("intro")}</p>
      </div>

      {cropSrc ? (
        <PhotoCropper src={cropSrc} busy={busy} help={tRegister("cropHelp")} onCancel={() => setCropSrc(null)} onConfirm={onCropped} />
      ) : (
        <>
          <div className="flex flex-wrap gap-6">
            <figure className="flex flex-col items-center gap-2">
              {currentUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- public avatar URL
                <img src={currentUrl} alt={t("current")} width={112} height={112} className="rounded-full border-2 border-gold" />
              ) : (
                <div aria-hidden="true" className="size-28 rounded-full border-2 border-border bg-band" />
              )}
              <figcaption className="text-sm text-muted">{t("current")}</figcaption>
            </figure>
            {pendingUrl && (
              <figure className="flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                <img src={pendingUrl} alt={t("new")} width={112} height={112} className="rounded-full border-2 border-dashed border-border" />
                <figcaption className="text-sm text-muted">{t("new")}</figcaption>
              </figure>
            )}
          </div>

          {pendingUrl ? (
            <p role="status" className="text-sm text-ink">
              {sent ? t("sent") : t("waiting")}
            </p>
          ) : (
            rejectedReason && <p className="text-sm text-ink">{t("rejected", { reason: rejectedReason })}</p>
          )}

          <div className="flex flex-col gap-1">
            <label className={`${pickerClass} self-start`} htmlFor={inputId}>
              {busy ? tRegister("processing") : t("choose")}
              <input id={inputId} type="file" accept={ACCEPT_ATTRIBUTE} className="sr-only" onChange={onChosen} disabled={busy} />
            </label>
            <p className="text-sm text-muted">{tRegister("fileHint")}</p>
          </div>
        </>
      )}
      <ErrorMessage>{error ? tRegister(`errors.${error}`) : null}</ErrorMessage>
    </section>
  );
}
