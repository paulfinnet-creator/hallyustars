"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition, type ChangeEvent } from "react";
import { PhotoCropper } from "@/components/PhotoCropper";
import { ErrorMessage } from "@/components/ui";
import { ACCEPT_ATTRIBUTE, MAX_UPLOAD_BYTES, photoKind } from "@/lib/images/rules";
import { uploadWithTicket } from "@/lib/images/upload";
import { createPhotoUpload, processCelebrityPhoto, type CelebrityError } from "../actions";

type PhotoError = CelebrityError | "wrongType" | "tooLarge";

/** The photocard picture: 3:4 portrait, cropped in the browser, published by the server. */
export function PhotoSection({ profileId, cardUrl, name }: { profileId: string; cardUrl: string | null; name: string }) {
  const t = useTranslations("admin.celebrities");
  const tReg = useTranslations("register");
  const inputId = useId();
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [error, setError] = useState<PhotoError | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!cropSrc?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(cropSrc);
  }, [cropSrc]);

  function onChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    const kind = photoKind(file);
    if (!kind) return setError("wrongType");
    if (file.size > MAX_UPLOAD_BYTES) return setError("tooLarge");
    if (kind !== "heic") return setCropSrc(URL.createObjectURL(file));

    // Browsers can't show HEIC: convert on the server first, then crop.
    startTransition(async () => {
      const uploaded = await uploadWithTicket<CelebrityError>(file, "heic", createPhotoUpload);
      if ("error" in uploaded) return setError(uploaded.error);
      const result = await processCelebrityPhoto({ profileId, path: uploaded.path, purpose: "source" });
      if ("error" in result) return setError(result.error);
      if ("previewUrl" in result) setCropSrc(URL.createObjectURL(await (await fetch(result.previewUrl)).blob()));
    });
  }

  function onCropped(photo: Blob) {
    startTransition(async () => {
      const uploaded = await uploadWithTicket<CelebrityError>(photo, "jpg", createPhotoUpload);
      if ("error" in uploaded) return setError(uploaded.error);
      const result = await processCelebrityPhoto({ profileId, path: uploaded.path, purpose: "photo" });
      if ("error" in result) return setError(result.error);
      setCropSrc(null); // the page re-renders with the new photo
    });
  }

  const errorText = !error ? null : error === "wrongType" || error === "tooLarge" ? tReg(`errors.${error}`) : t(`errors.${error}`);

  return (
    <div className="flex flex-col gap-4">
      {cropSrc ? (
        <PhotoCropper
          src={cropSrc}
          busy={pending}
          help={t("cropHelp")}
          aspect={3 / 4}
          shape="rect"
          maxWidth={1200}
          onCancel={() => setCropSrc(null)}
          onConfirm={onCropped}
        />
      ) : (
        <div className="flex flex-wrap items-end gap-4">
          <div className="aspect-[3/4] w-36 overflow-hidden rounded-lg border-2 border-gold bg-band">
            {cardUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL
              <img src={cardUrl} alt={t("photoAlt", { name })} className="h-full w-full object-cover" />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor={inputId}
              className="inline-flex cursor-pointer items-center justify-center self-start rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-ink hover:opacity-90 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary"
            >
              {pending ? tReg("processing") : cardUrl ? t("changePhoto") : t("choosePhoto")}
              <input id={inputId} type="file" accept={ACCEPT_ATTRIBUTE} className="sr-only" onChange={onChosen} disabled={pending} />
            </label>
            <p className="text-sm text-muted">{tReg("fileHint")}</p>
          </div>
        </div>
      )}
      <ErrorMessage>{errorText}</ErrorMessage>
    </div>
  );
}
