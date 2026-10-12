"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, ErrorMessage } from "@/components/ui";
import { withdrawInvitation, type InvitationError } from "./actions";

export function WithdrawButton({ invitationId }: { invitationId: string }) {
  const t = useTranslations("invitations");
  const [error, setError] = useState<InvitationError | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <ErrorMessage>{error ? t(`errors.${error}`) : null}</ErrorMessage>
      <Button
        variant="secondary"
        className="self-start"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await withdrawInvitation(invitationId);
            setError("error" in result ? result.error : null);
          })
        }
      >
        {t("withdraw")}
      </Button>
    </div>
  );
}
