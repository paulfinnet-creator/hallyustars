"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Button } from "@/components/ui";
import { MAX_SIDE } from "@/lib/images/rules";

const VIEW_HEIGHT = 280; // crop area height, CSS px
const PREVIEW_HEIGHT = 88;
const MAX_ZOOM = 4;

type Crop = { x: number; y: number; zoom: number }; // x, y: top-left of the crop area, in image px

/**
 * Crop with drag, arrow keys and a zoom slider. `aspect` is width / height
 * (1 for profile photos, 3/4 for celebrity cards). Calls onConfirm with a JPG
 * at most `maxWidth` px wide.
 */
export function PhotoCropper({
  src,
  busy,
  onCancel,
  onConfirm,
  help,
  aspect = 1,
  shape = "circle",
  maxWidth = MAX_SIDE,
}: {
  src: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (photo: Blob) => void;
  help: string;
  aspect?: number;
  shape?: "circle" | "rect";
  maxWidth?: number;
}) {
  const t = useTranslations("register");
  const zoomId = useId();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ px: number; py: number; crop: Crop } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0, zoom: 1 });

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const cw = Math.min(w, h * aspect);
      const ch = cw / aspect;
      setSize({ w, h });
      // Start centred, slightly towards the top where faces usually are.
      setCrop({ x: (w - cw) / 2, y: Math.max(0, (h - ch) / 3), zoom: 1 });
    };
    img.src = src;
  }, [src, aspect]);

  if (!size) {
    return (
      <p role="status" className="text-muted">
        {t("processing")}
      </p>
    );
  }

  const viewW = VIEW_HEIGHT * aspect;
  const baseW = Math.min(size.w, size.h * aspect); // widest crop that fits the image
  const cropW = baseW / crop.zoom;
  const cropH = cropW / aspect;

  function clamp(next: Crop): Crop {
    const w = baseW / next.zoom;
    const h = w / aspect;
    return {
      zoom: next.zoom,
      x: Math.min(Math.max(0, next.x), size!.w - w),
      y: Math.min(Math.max(0, next.y), size!.h - h),
    };
  }

  function setZoom(zoom: number) {
    // Keep the centre of the crop area where it is.
    const cx = crop.x + cropW / 2;
    const cy = crop.y + cropH / 2;
    const w = baseW / zoom;
    setCrop(clamp({ zoom, x: cx - w / 2, y: cy - w / aspect / 2 }));
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, crop };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const perPx = cropW / viewW;
    const start = drag.current.crop;
    setCrop(
      clamp({
        zoom: start.zoom,
        x: start.x - (e.clientX - drag.current.px) * perPx,
        y: start.y - (e.clientY - drag.current.py) * perPx,
      }),
    );
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = cropW * 0.05;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setCrop(clamp({ ...crop, x: crop.x + move[0], y: crop.y + move[1] }));
  }

  function confirm() {
    const outW = Math.round(Math.min(cropW, maxWidth));
    const outH = Math.round(outW / aspect);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    canvas.getContext("2d")!.drawImage(imgRef.current!, crop.x, crop.y, cropW, cropH, 0, 0, outW, outH);
    canvas.toBlob((blob) => blob && onConfirm(blob), "image/jpeg", 0.9);
  }

  /** The image positioned so the crop area fills a box `boxW` px wide. */
  function imageStyle(boxW: number) {
    const scale = boxW / cropW;
    return {
      width: size!.w * scale,
      height: size!.h * scale,
      transform: `translate(${-crop.x * scale}px, ${-crop.y * scale}px)`,
    };
  }

  const guide = shape === "circle" ? "rounded-full" : "rounded-md";
  const previewW = PREVIEW_HEIGHT * aspect;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{help}</p>
      <div className="flex flex-wrap items-end gap-6">
        {/* dir="ltr": this is image geometry, not page layout. */}
        <div
          role="group"
          aria-label={t("cropArea")}
          tabIndex={0}
          dir="ltr"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={onKeyDown}
          className="relative max-w-full cursor-grab touch-none overflow-hidden rounded-lg bg-band select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:cursor-grabbing"
          style={{ width: viewW, height: VIEW_HEIGHT }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, not optimisable */}
          <img src={src} alt="" draggable={false} className="pointer-events-none absolute start-0 top-0 max-w-none origin-top-left" style={imageStyle(viewW)} />
          {/* Darken outside the shape the photo will be shown in. */}
          <div className={`pointer-events-none absolute inset-0 ${guide} shadow-[0_0_0_999px_rgb(0_0_0/0.45)]`} />
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className={`relative overflow-hidden border-2 border-gold ${guide}`} style={{ width: previewW, height: PREVIEW_HEIGHT }} dir="ltr">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, not optimisable */}
            <img src={src} alt={t("previewLabel")} draggable={false} className="absolute start-0 top-0 max-w-none origin-top-left" style={imageStyle(previewW)} />
          </div>
          <span className="text-xs text-muted">{t("previewLabel")}</span>
        </div>
      </div>
      <div className="flex max-w-[280px] flex-col gap-1.5">
        <label htmlFor={zoomId} className="text-sm font-medium">
          {t("zoom")}
        </label>
        <input
          id={zoomId}
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={crop.zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="accent-primary"
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <Button onClick={confirm} disabled={busy}>
          {busy ? t("uploading") : t("usePhoto")}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
