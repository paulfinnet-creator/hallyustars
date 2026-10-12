"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { CODE_INPUT } from "@/components/codeInput";
import { Button, ErrorMessage, TextField } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { Link, useRouter } from "@/i18n/navigation";
import { formatInviteCode, normalizeInviteCode } from "@/lib/invites/code";
import { deviceTimeZone } from "@/lib/time/format";
import { requestCode, verifyCode, type SignInError } from "../sign-in/actions";
import { checkInviteCode, startRegistration, type InviteError } from "./actions";

type Step = "code" | "email" | "otp";

export function InviteFlow({ initialCode }: { initialCode: string }) {
  const t = useTranslations("invite");
  const tAuth = useTranslations("auth");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState(initialCode);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<{ invite: InviteError } | { auth: SignInError } | null>(null);
  const [pending, startTransition] = useTransition();

  function submitCode(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await checkInviteCode(code);
      if ("error" in result) return setError({ invite: result.error });
      // Show the code the way the invitation does.
      const normalized = normalizeInviteCode(code);
      if (normalized) setCode(formatInviteCode(normalized));
      setStep("email");
    });
  }

  function submitEmail(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await startRegistration({ code, email, locale, timeZone: deviceTimeZone() });
      if ("error" in result) return setError({ invite: result.error });
      setOtp("");
      setStep("otp");
    });
  }

  function resend() {
    setError(null);
    startTransition(async () => {
      const result = await requestCode(email, locale);
      if ("error" in result) setError({ auth: result.error });
    });
  }

  function submitOtp(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await verifyCode({ email, code: otp, timeZone: deviceTimeZone() });
      if ("error" in result) return setError({ auth: result.error });
      router.replace(result.next === "done" ? result.href : "/sign-in");
    });
  }

  const errorText = !error ? null : "invite" in error ? t(`errors.${error.invite}`) : tAuth(`errors.${error.auth}`);

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6 shadow-sm">
      {step === "code" && (
        <form onSubmit={submitCode} className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted">{t("codeIntro")}</p>
          <TextField
            id="invite-code"
            label={t("codeLabel")}
            placeholder="SKCE-XXXX-XXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            dir="ltr"
            required
            autoFocus
            maxLength={40}
            className="font-mono tracking-wider uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <ErrorMessage>{errorText}</ErrorMessage>
          <Button type="submit" disabled={pending}>
            {t("continue")}
          </Button>
        </form>
      )}

      {step === "email" && (
        <form onSubmit={submitEmail} className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">{t("emailTitle")}</h1>
          <p className="text-muted">{t("emailIntro")}</p>
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
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setError(null);
              setStep("code");
            }}
          >
            {t("differentCode")}
          </Button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={submitOtp} className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">{tAuth("checkEmailTitle")}</h1>
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
            label={tAuth("codeLabel")}
            autoFocus
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            {...CODE_INPUT}
          />
          <ErrorMessage>{errorText}</ErrorMessage>
          <Button type="submit" disabled={pending}>
            {tAuth("continue")}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={resend}>
            {tAuth("resend")}
          </Button>
        </form>
      )}

      <p className="text-sm text-muted">
        {t.rich("haveAccount", {
          link: (chunks) => (
            <Link href="/sign-in" className="font-medium text-primary underline underline-offset-4">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </section>
  );
}
