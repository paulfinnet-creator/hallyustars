"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { LocalTime } from "@/components/LocalTime";
import { Button, ErrorMessage } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { MESSAGE_MAX } from "@/lib/chat-invitations/status";
import { sendInvitation, withdrawInvitation, type InvitationError } from "../../invitations/actions";

export type InviteState =
  | { kind: "form"; previous: { status: "rejected" | "expired" | "withdrawn"; reason: string | null } | null }
  | { kind: "waiting"; invitationId: string; sentAt: string; expiresAt: string }
  | { kind: "approved"; conversationId: string | null };

/** The fan's side of inviting a star to chat (CLAUDE.md › Chat invitations). */
export function InviteSection({ celebrityId, name, state }: { celebrityId: string; name: string; state: InviteState }) {
  const t = useTranslations("invitations");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<InvitationError | null>(null);
  const [pending, startTransition] = useTransition();

  function send(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await sendInvitation({ celebrityId, message });
      if ("error" in result) setError(result.error);
      else setMessage("");
    });
  }

  function withdraw(invitationId: string) {
    setError(null);
    startTransition(async () => {
      const result = await withdrawInvitation(invitationId);
      if ("error" in result) setError(result.error);
    });
  }

  const errorText = error ? t(`errors.${error}`) : null;

  if (state.kind === "approved") {
    return (
      <div className="flex flex-col gap-2">
        <p>{t("approvedOnProfile", { name })}</p>
        {state.conversationId && (
          <Link
            href={`/chats/${state.conversationId}`}
            className="self-start rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-ink hover:opacity-90"
          >
            {t("openChat")}
          </Link>
        )}
        <Link href="/invitations" className="self-start text-sm text-primary underline underline-offset-4">
          {t("myInvitations")}
        </Link>
      </div>
    );
  }

  if (state.kind === "waiting") {
    return (
      <div className="flex flex-col gap-3">
        <p role="status">{t("waitingOnProfile", { name })}</p>
        <p className="text-sm text-muted">
          {t.rich("sentOn", { date: () => <LocalTime iso={state.sentAt} /> })}{" "}
          {t.rich("expiresOn", { date: () => <LocalTime iso={state.expiresAt} options={{ dateStyle: "medium" }} /> })}
        </p>
        <ErrorMessage>{errorText}</ErrorMessage>
        <Button variant="secondary" className="self-start" disabled={pending} onClick={() => withdraw(state.invitationId)}>
          {t("withdraw")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-3">
      {state.previous && (
        <p className="rounded-lg border border-border bg-band px-3 py-2 text-sm">
          {t(`previous.${state.previous.status}`)}
          {state.previous.reason && (
            <>
              {" "}
              {t("reasonLabel")} <span className="italic">{state.previous.reason}</span>
            </>
          )}
        </p>
      )}
      <label htmlFor="invite-message" className="text-sm font-medium">
        {t("messageLabel", { name })}
      </label>
      <textarea
        id="invite-message"
        required
        rows={4}
        maxLength={MESSAGE_MAX}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        aria-describedby="invite-message-hint"
        className="rounded-lg border border-border bg-surface px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
      />
      <div id="invite-message-hint" className="flex flex-wrap justify-between gap-2 text-sm text-muted">
        <span>{t("messageHint", { name })}</span>
        <span>{t("charCount", { count: message.length, max: MESSAGE_MAX })}</span>
      </div>
      <ErrorMessage>{errorText}</ErrorMessage>
      <Button type="submit" className="self-start" disabled={pending || !message.trim()}>
        {t("send")}
      </Button>
    </form>
  );
}
