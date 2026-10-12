"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "./ui";

/** Copies `value`; `label` names what is copied for screen readers ("Copy invite code"). */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard blocked (permissions or insecure context): the value stays
      // visible and selectable, so the admin can copy it by hand.
    }
  }

  return (
    <Button variant="secondary" onClick={copy} aria-label={label}>
      <span aria-live="polite">{copied ? t("copied") : t("copy")}</span>
    </Button>
  );
}
