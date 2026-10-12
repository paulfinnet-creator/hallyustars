"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button, ErrorMessage } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

const REASON_MAX = 1000;

/**
 * Report (a message or the whole conversation) in a modal dialog. Reports go
 * to the admins' moderation queue; the reported person isn't told.
 */
export function ReportDialog({
  conversationId,
  messageId,
  onClose,
}: {
  conversationId: string;
  /** null: report the whole conversation. */
  messageId: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("chat.safety");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<"duplicate" | "failed" | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState("sending");
    setError(null);
    const { error: insertError } = await createClient()
      .from("reports")
      .insert({ conversation_id: conversationId, message_id: messageId, reason: reason.trim() });
    if (insertError) {
      setState("idle");
      setError(insertError.code === "23505" ? "duplicate" : "failed");
      return;
    }
    setState("sent");
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-ink backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-4 p-5">
        <h2 id={titleId} className="text-xl font-semibold">
          {messageId ? t("reportMessageTitle") : t("reportChatTitle")}
        </h2>
        {state === "sent" ? (
          <>
            <p role="status">{t("reportSent")}</p>
            <Button className="self-end" onClick={() => dialogRef.current?.close()}>
              {t("close")}
            </Button>
          </>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
            <p className="text-sm text-muted">{t("reportIntro")}</p>
            <label htmlFor="report-reason" className="text-sm font-medium">
              {t("reasonLabel")}
            </label>
            <textarea
              id="report-reason"
              required
              rows={4}
              maxLength={REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
            />
            <ErrorMessage>{error ? t(`errors.${error}`) : null}</ErrorMessage>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
                {t("cancel")}
              </Button>
              <Button type="submit" variant="danger" disabled={state === "sending" || !reason.trim()}>
                {t("sendReport")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}

/** Confirm before blocking: neither person can then send in this chat. */
export function BlockDialog({
  otherId,
  name,
  onBlocked,
  onClose,
}: {
  otherId: string;
  name: string;
  onBlocked: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("chat.safety");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  async function block() {
    setBusy(true);
    setFailed(false);
    const { error } = await createClient().from("blocks").insert({ blocked_id: otherId });
    setBusy(false);
    // Already blocked counts as done.
    if (error && error.code !== "23505") return setFailed(true);
    onBlocked();
    dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-ink backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-4 p-5">
        <h2 id={titleId} className="text-xl font-semibold">
          {t("blockTitle", { name })}
        </h2>
        <p className="text-sm text-muted">{t("blockIntro", { name })}</p>
        <ErrorMessage>{failed ? t("errors.failed") : null}</ErrorMessage>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
            {t("cancel")}
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void block()}>
            {t("blockConfirm")}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

/** The ⋯ menu in the chat header: report the chat, block or unblock. */
export function SafetyMenu({
  name,
  blocked,
  onReport,
  onBlock,
  onUnblock,
}: {
  name: string;
  blocked: boolean;
  onReport: () => void;
  onBlock: () => void;
  onUnblock: () => void;
}) {
  const t = useTranslations("chat.safety");
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "block w-full px-4 py-2 text-start text-sm hover:bg-band focus-visible:bg-band focus-visible:outline-none";
  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div ref={rootRef} className="relative ms-auto">
      <button
        type="button"
        aria-label={t("menu")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
        className="flex size-9 items-center justify-center rounded-full text-lg hover:bg-surface"
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute end-0 top-10 z-20 min-w-48 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg"
        >
          <button type="button" role="menuitem" className={item} onClick={choose(onReport)}>
            {t("reportChat")}
          </button>
          {blocked ? (
            <button type="button" role="menuitem" className={item} onClick={choose(onUnblock)}>
              {t("unblock", { name })}
            </button>
          ) : (
            <button type="button" role="menuitem" className={`${item} text-accent`} onClick={choose(onBlock)}>
              {t("block", { name })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
