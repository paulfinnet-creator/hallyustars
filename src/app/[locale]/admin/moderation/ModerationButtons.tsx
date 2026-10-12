"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Button, ErrorMessage } from "@/components/ui";
import {
  closeConversation,
  handleReport,
  removeMessage,
  setSuspended,
  type ModerationError,
} from "./actions";

type Result = { ok: true } | { error: ModerationError };

/** One action with an optional note, confirm step and error message. */
function ActionWithNote({
  label,
  confirmLabel,
  noteLabel,
  variant = "secondary",
  act,
}: {
  label: string;
  confirmLabel: string;
  /** Without a note label the confirm step has no text box. */
  noteLabel?: string;
  variant?: "secondary" | "danger";
  act: (note: string) => Promise<Result>;
}) {
  const t = useTranslations("admin.moderation");
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<ModerationError | null>(null);
  const [pending, startTransition] = useTransition();
  const noteId = useId();

  if (!open) {
    return (
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-border bg-band p-3">
      {noteLabel && (
        <>
          <label htmlFor={noteId} className="text-sm font-medium">
            {noteLabel}
          </label>
          <textarea
            id={noteId}
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-ink"
          />
        </>
      )}
      <ErrorMessage>{error ? t(`errors.${error}`) : null}</ErrorMessage>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={variant === "danger" ? "danger" : "primary"}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await act(note);
              if ("error" in result) setError(result.error);
              else setOpen(false);
            })
          }
        >
          {confirmLabel}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}

export function ReportButtons({ reportId }: { reportId: string }) {
  const t = useTranslations("admin.moderation");
  return (
    <div className="flex flex-wrap gap-2">
      <ActionWithNote
        label={t("resolve")}
        confirmLabel={t("confirmResolve")}
        noteLabel={t("resolutionLabel")}
        act={(resolution) => handleReport({ reportId, status: "resolved", resolution })}
      />
      <ActionWithNote
        label={t("dismiss")}
        confirmLabel={t("confirmDismiss")}
        noteLabel={t("resolutionLabel")}
        act={(resolution) => handleReport({ reportId, status: "dismissed", resolution })}
      />
    </div>
  );
}

export function RemoveMessageButton({ messageId }: { messageId: string }) {
  const t = useTranslations("admin.moderation");
  return (
    <ActionWithNote
      label={t("removeMessage")}
      confirmLabel={t("confirmRemove")}
      noteLabel={t("removeReasonLabel")}
      variant="danger"
      act={(reason) => removeMessage({ messageId, reason })}
    />
  );
}

export function CloseConversationButton({ conversationId }: { conversationId: string }) {
  const t = useTranslations("admin.moderation");
  return (
    <ActionWithNote
      label={t("closeChat")}
      confirmLabel={t("confirmClose")}
      variant="danger"
      act={() => closeConversation(conversationId)}
    />
  );
}

export function SuspendButton({ userId, name, suspended }: { userId: string; name: string; suspended: boolean }) {
  const t = useTranslations("admin.moderation");
  return suspended ? (
    <ActionWithNote
      label={t("restore", { name })}
      confirmLabel={t("confirmRestore", { name })}
      act={() => setSuspended({ userId, suspended: false })}
    />
  ) : (
    <ActionWithNote
      label={t("suspend", { name })}
      confirmLabel={t("confirmSuspend", { name })}
      variant="danger"
      act={() => setSuspended({ userId, suspended: true })}
    />
  );
}
