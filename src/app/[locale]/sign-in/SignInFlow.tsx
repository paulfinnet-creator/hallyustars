"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { CODE_INPUT } from "@/components/codeInput";
import { CopyButton } from "@/components/CopyButton";
import { Button, ErrorMessage, TextField } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { useRouter } from "@/i18n/navigation";
import { deviceTimeZone } from "@/lib/time/format";
import {
  requestCode,
  startMfa,
  verifyCode,
  verifyMfa,
  type MfaStart,
  type SignInError,
} from "./actions";

type Step = { name: "email" } | { name: "code" } | { name: "mfa-loading" } | MfaStep;
type MfaStep =
  | { name: "mfa-verify"; factorId: string }
  | { name: "mfa-enroll"; factorId: string; qrCode: string; secret: string };

function toMfaStep(start: MfaStart): MfaStep {
  return start.step === "verify"
    ? { name: "mfa-verify", factorId: start.factorId }
    : { name: "mfa-enroll", factorId: start.factorId, qrCode: start.qrCode, secret: start.secret };
}

export function SignInFlow({ initialStep }: { initialStep: "email" | "mfa" }) {
  const t = useTranslations("auth");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [step, setStep] = useState<Step>(
    initialStep === "mfa" ? { name: "mfa-loading" } : { name: "email" },
  );
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<SignInError | null>(null);
  const [pending, startTransition] = useTransition();

  function loadMfa() {
    startTransition(async () => {
      const result = await startMfa();
      if ("error" in result) {
        setError(result.error);
        setStep({ name: "email" });
      } else {
        setStep(toMfaStep(result));
      }
    });
  }

  function beginMfa() {
    setStep({ name: "mfa-loading" });
    loadMfa();
  }

  useEffect(() => {
    if (initialStep === "mfa") loadMfa();
    // Run once on arrival only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sendCode(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestCode(email, locale);
      if ("error" in result) return setError(result.error);
      setCode("");
      setStep({ name: "code" });
    });
  }

  function submitCode(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await verifyCode({ email, code, timeZone: deviceTimeZone() });
      if ("error" in result) return setError(result.error);
      setCode("");
      if (result.next === "mfa") return beginMfa();
      router.replace(result.href);
    });
  }

  function submitMfa(event: FormEvent, factorId: string) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await verifyMfa({ factorId, code });
      if ("error" in result) return setError(result.error);
      router.replace(result.href);
    });
  }

  const errorText = error ? t(`errors.${error}`) : null;

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6 shadow-sm">
      {step.name === "email" && (
        <form onSubmit={sendCode} className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <TextField
            id="email"
            label={t("emailLabel")}
            type="email"
            autoComplete="email"
            dir="ltr"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <ErrorMessage>{errorText}</ErrorMessage>
          <Button type="submit" disabled={pending}>
            {t("sendCode")}
          </Button>
        </form>
      )}

      {step.name === "code" && (
        <form onSubmit={submitCode} className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">{t("checkEmailTitle")}</h1>
          <p className="text-muted">
            {t.rich("codeSent", {
              email: () => (
                <bdi dir="ltr" className="font-medium text-ink">
                  {email}
                </bdi>
              ),
            })}
          </p>
          <TextField
            id="code"
            label={t("codeLabel")}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            {...CODE_INPUT}
          />
          <ErrorMessage>{errorText}</ErrorMessage>
          <Button type="submit" disabled={pending}>
            {t("continue")}
          </Button>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" disabled={pending} onClick={() => sendCode()}>
              {t("resend")}
            </Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setError(null);
                setStep({ name: "email" });
              }}
            >
              {t("differentEmail")}
            </Button>
          </div>
        </form>
      )}

      {step.name === "mfa-loading" && (
        <p role="status" className="text-muted">
          {t("loading")}
        </p>
      )}

      {step.name === "mfa-enroll" && (
        <form onSubmit={(e) => submitMfa(e, step.factorId)} className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">{t("mfaEnrollTitle")}</h1>
          <p className="text-muted">{t("mfaEnrollBody")}</p>
          {/* White behind the QR code in both themes so every camera can read it. */}
          <div className="self-center rounded-lg bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG data URI from Supabase */}
            <img src={step.qrCode} alt={t("qrAlt")} width={180} height={180} />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">{t("mfaSecretLabel")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <code
                dir="ltr"
                data-testid="mfa-secret"
                className="rounded-md bg-band px-2 py-1 font-mono text-sm break-all text-ink select-all"
              >
                {step.secret.match(/.{1,4}/g)?.join(" ")}
              </code>
              <CopyButton value={step.secret} label={t("copySecret")} />
            </div>
          </div>
          <TextField
            id="mfa-code"
            label={t("mfaCodeLabel")}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            {...CODE_INPUT}
          />
          <ErrorMessage>{errorText}</ErrorMessage>
          <Button type="submit" disabled={pending}>
            {t("continue")}
          </Button>
        </form>
      )}

      {step.name === "mfa-verify" && (
        <form onSubmit={(e) => submitMfa(e, step.factorId)} className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">{t("mfaVerifyTitle")}</h1>
          <p className="text-muted">{t("mfaVerifyBody")}</p>
          <TextField
            id="mfa-code"
            label={t("mfaCodeLabel")}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            {...CODE_INPUT}
          />
          <ErrorMessage>{errorText}</ErrorMessage>
          <Button type="submit" disabled={pending}>
            {t("continue")}
          </Button>
        </form>
      )}
    </section>
  );
}
