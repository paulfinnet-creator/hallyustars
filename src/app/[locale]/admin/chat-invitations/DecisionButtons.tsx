"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, ErrorMessage } from "@/components/ui";
import { REASON_MAX } from "@/lib/chat-invitations/status";
import { decideInvitation, type DecisionError } from "./actions";

export function DecisionButtons({
  invitationId,
  fanName,
  celebrityName,
  canApprove,
}: {
  invitationId: string;
  fanName: string;
  celebrityName: string;
  canApprove: boolean;
}) {
  const t = useTranslations("admin.chatInvitations");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<DecisionError | null>(null);
  const [pending, startTransition] = useTransition();
  const reasonId = `reason-${invitationId}`;

  function decide(approve: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await decideInvitation({ invitationId, approve, reason: approve ? "" : reason });
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ErrorMessage>{error ? t(`errors.${error}`) : null}</ErrorMessage>
      {rejecting ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={reasonId} className="text-sm font-medium">
            {t("reasonLabel")}
          </label>
          <textarea
            id={reasonId}
            rows={2}
            maxLength={REASON_MAX}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          />
          <p className="text-xs text-muted">{t("reasonHint")}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" disabled={pending} onClick={() => decide(false)}>
              {t("confirmReject")}
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => setRejecting(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending || !canApprove}
            onClick={() => decide(true)}
            aria-label={t("approveLabel", { fan: fanName, celebrity: celebrityName })}
          >
            {t("approve")}
          </Button>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => setRejecting(true)}
            aria-label={t("rejectLabel", { fan: fanName, celebrity: celebrityName })}
          >
            {t("reject")}
          </Button>
        </div>
      )}
    </div>
  );
}
