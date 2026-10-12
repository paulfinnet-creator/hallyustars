"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { ErrorMessage } from "@/components/ui";
import { setChatEmails } from "./actions";

export function ChatEmailsToggle({ initial }: { initial: boolean }) {
  const t = useTranslations("settings");
  const [enabled, setEnabled] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    setStatus("idle");
    startTransition(async () => {
      const result = await setChatEmails(next);
      if ("error" in result) {
        setEnabled(!next);
        setStatus("failed");
      } else {
        setStatus("saved");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span id="chat-emails-label" className="font-medium">
            {t("chatEmailsLabel")}
          </span>
          <p id="chat-emails-help" className="text-sm text-muted">
            {t("chatEmailsHelp")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="chat-emails-label"
          aria-describedby="chat-emails-help"
          disabled={pending}
          onClick={toggle}
          className="relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-border bg-band transition-colors aria-checked:border-primary aria-checked:bg-primary disabled:opacity-60 motion-reduce:transition-none"
        >
          <span
            aria-hidden="true"
            className={`inline-block size-5 rounded-full bg-surface shadow transition-transform motion-reduce:transition-none ${
              enabled ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1"
            }`}
          />
        </button>
      </div>
      <p aria-live="polite" className="text-sm text-primary">
        {status === "saved" ? t("saved") : null}
      </p>
      <ErrorMessage>{status === "failed" ? t("failed") : null}</ErrorMessage>
    </div>
  );
}
