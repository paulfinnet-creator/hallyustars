"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition, type ChangeEvent } from "react";
import { Button, ErrorMessage } from "@/components/ui";
import { ACCEPT_ATTRIBUTE, MAX_SIDE, MAX_UPLOAD_BYTES, photoKind } from "@/lib/images/rules";
import { resizedJpeg, uploadWithTicket } from "@/lib/images/upload";
import { createUpload, processUpload, submitRegistration, type RegisterError } from "./actions";
import { PhotoCropper } from "@/components/PhotoCropper";

type IdType = "passport" | "national_id" | "drivers_license";
const ID_TYPES: IdType[] = ["passport", "national_id", "drivers_license"];
type Step = "photo" | "id" | "review";
type FileError = "wrongType" | "tooLarge";

function upload(blob: Blob, format: "jpg" | "heic") {
  return uploadWithTicket<RegisterError>(blob, format, createUpload);
}

function checkFile(file: File): FileError | null {
  if (!photoKind(file)) return "wrongType";
  if (file.size > MAX_UPLOAD_BYTES) return "tooLarge";
  return null;
}

export function RegisterFlow({
  initialPhotoUrl,
  initialIdUrl,
  initialIdType,
}: {
  initialPhotoUrl: string | null;
  initialIdUrl: string | null;
  initialIdType: IdType | null;
}) {
  const t = useTranslations("register");
  const [step, setStep] = useState<Step>(initialPhotoUrl ? (initialIdUrl ? "review" : "id") : "photo");
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
  const [idUrl, setIdUrl] = useState(initialIdUrl);
  const [idType, setIdType] = useState<IdType | null>(initialIdType);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [error, setError] = useState<RegisterError | FileError | null>(null);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const photoInputId = useId();
  const idInputId = useId();

  // Move focus to each new step's heading for keyboard and screen-reader users.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  // Free the object URL of a photo once the crop tool is done with it.
  useEffect(() => {
    if (!cropSrc?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(cropSrc);
  }, [cropSrc]);

  function onPhotoChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    const problem = checkFile(file);
    if (problem) return setError(problem);

    if (photoKind(file) !== "heic") return setCropSrc(URL.createObjectURL(file));
    // Most browsers can't show HEIC: convert it on the server first, then crop.
    startTransition(async () => {
      const uploaded = await upload(file, "heic");
      if ("error" in uploaded) return setError(uploaded.error);
      const result = await processUpload({ purpose: "source", path: uploaded.path });
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
      const result = await processUpload({ purpose: "profile", path: uploaded.path });
      if ("error" in result) return setError(result.error);
      setPhotoUrl(result.previewUrl);
      setCropSrc(null);
    });
  }

  function onIdChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    if (!idType) return setError("chooseIdType");
    const problem = checkFile(file);
    if (problem) return setError(problem);

    startTransition(async () => {
      const heic = photoKind(file) === "heic";
      const uploaded = await upload(heic ? file : await resizedJpeg(file, MAX_SIDE), heic ? "heic" : "jpg");
      if ("error" in uploaded) return setError(uploaded.error);
      const result = await processUpload({ purpose: "id", path: uploaded.path, idType });
      if ("error" in result) return setError(result.error);
      setIdUrl(result.previewUrl);
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await submitRegistration();
      if ("error" in result) setError(result.error);
      // On success the page re-renders as "pending review".
    });
  }

  const stepNumber = { photo: 1, id: 2, review: 3 }[step];
  const errorText = error ? t(`errors.${error}`) : null;
  const pickerClass =
    "inline-flex cursor-pointer items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-ink hover:opacity-90 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary";

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">{t("stepOf", { current: stepNumber, total: 3 })}</p>
        <ol className="flex gap-2" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <li key={n} className={`h-1.5 flex-1 rounded-full ${n <= stepNumber ? "bg-primary" : "bg-band"}`} />
          ))}
        </ol>
      </div>

      {step === "photo" && (
        <div className="flex flex-col gap-4">
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
            {t("photoTitle")}
          </h2>
          <p className="text-muted">{t("photoIntro")}</p>
          {cropSrc ? (
            <PhotoCropper src={cropSrc} busy={pending} help={t("cropHelp")} onCancel={() => setCropSrc(null)} onConfirm={onCropped} />
          ) : (
            <>
              {photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                <img src={photoUrl} alt={t("yourPhoto")} width={160} height={160} className="rounded-full border-2 border-gold" />
              )}
              <div className="flex flex-col gap-1">
                <label className={`${pickerClass} self-start`} htmlFor={photoInputId}>
                  {pending ? t("processing") : photoUrl ? t("changePhoto") : t("choosePhoto")}
                  <input id={photoInputId} type="file" accept={ACCEPT_ATTRIBUTE} className="sr-only" onChange={onPhotoChosen} disabled={pending} />
                </label>
                <p className="text-sm text-muted">{t("fileHint")}</p>
              </div>
            </>
          )}
          <ErrorMessage>{errorText}</ErrorMessage>
          {photoUrl && !cropSrc && (
            <Button className="self-start" onClick={() => setStep("id")} disabled={pending}>
              {t("continue")}
            </Button>
          )}
        </div>
      )}

      {step === "id" && (
        <div className="flex flex-col gap-4">
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
            {t("idTitle")}
          </h2>
          <p className="text-muted">{t("idIntro")}</p>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t("idTypeLabel")}</legend>
            {ID_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="id-type"
                  value={type}
                  checked={idType === type}
                  onChange={() => setIdType(type)}
                  className="accent-primary"
                />
                {t(`idTypes.${type}`)}
              </label>
            ))}
          </fieldset>
          {idUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
            <img src={idUrl} alt={t("yourId")} className="max-h-64 w-auto self-start rounded-lg border border-border" />
          )}
          <div className="flex flex-col gap-1">
            <label className={`${pickerClass} self-start`} htmlFor={idInputId}>
              {pending ? t("uploading") : idUrl ? t("changeId") : t("chooseId")}
              <input id={idInputId} type="file" accept={ACCEPT_ATTRIBUTE} className="sr-only" onChange={onIdChosen} disabled={pending} />
            </label>
            <p className="text-sm text-muted">{t("fileHint")}</p>
          </div>
          <ErrorMessage>{errorText}</ErrorMessage>
          <div className="flex flex-wrap gap-3">
            {idUrl && (
              <Button onClick={() => setStep("review")} disabled={pending}>
                {t("continue")}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setStep("photo")} disabled={pending}>
              {t("back")}
            </Button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="flex flex-col gap-4">
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
            {t("reviewTitle")}
          </h2>
          <p className="text-muted">{t("reviewIntro")}</p>
          <div className="flex flex-wrap items-start gap-6">
            {photoUrl && (
              <figure className="flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                <img src={photoUrl} alt="" width={120} height={120} className="rounded-full border-2 border-gold" />
                <figcaption className="text-sm text-muted">{t("yourPhoto")}</figcaption>
              </figure>
            )}
            {idUrl && (
              <figure className="flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                <img src={idUrl} alt="" className="max-h-32 w-auto rounded-lg border border-border" />
                <figcaption className="text-sm text-muted">
                  {t("yourId")}
                  {idType && ` · ${t(`idTypes.${idType}`)}`}
                </figcaption>
              </figure>
            )}
          </div>
          <ErrorMessage>{errorText}</ErrorMessage>
          <div className="flex flex-wrap gap-3">
            <Button onClick={submit} disabled={pending}>
              {t("submit")}
            </Button>
            <Button variant="secondary" onClick={() => setStep("id")} disabled={pending}>
              {t("back")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
