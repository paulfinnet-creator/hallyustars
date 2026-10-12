import "server-only";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  render,
} from "@react-email/components";
import { createTranslator } from "next-intl";
import type { ReactNode } from "react";
import { directionFor, type Locale } from "@/i18n/config";
import { formatDate } from "@/lib/time/format";

/**
 * Email templates (React Email). Day-theme colours from CLAUDE.md › Design.
 * Emails never contain message text (CLAUDE.md › Email notifications).
 */

const COLORS = {
  bg: "#F7F3EA",
  surface: "#FFFDF8",
  ink: "#1E1B18",
  muted: "#5C554C",
  border: "#E2D8C5",
  primary: "#3F7A69",
  primaryInk: "#FFFFFF",
  gold: "#C9982F",
};

const FONT = "'IBM Plex Sans KR', 'Noto Sans', 'Noto Sans Thai', 'Noto Sans Arabic', Arial, sans-serif";
const HEADING_FONT = "'Noto Serif KR', 'Noto Serif', 'Noto Naskh Arabic', Georgia, serif";

export type RenderedEmail = { subject: string; html: string; text: string };

async function translatorFor(locale: Locale) {
  const messages = (await import(`../../../messages/${locale}.json`)).default;
  return createTranslator({ locale, messages, namespace: "email" });
}

type EmailTranslator = Awaited<ReturnType<typeof translatorFor>>;

function Layout({
  locale,
  preview,
  t,
  footer,
  children,
}: {
  locale: Locale;
  preview: string;
  t: EmailTranslator;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const dir = directionFor(locale);
  return (
    <Html lang={locale} dir={dir}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: COLORS.bg, color: COLORS.ink, fontFamily: FONT, margin: 0, padding: "24px 0" }}>
        <Container
          style={{
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderTop: `4px solid ${COLORS.gold}`,
            borderRadius: 12,
            maxWidth: 520,
            padding: "28px 24px",
            direction: dir,
            textAlign: dir === "rtl" ? "right" : "left",
          }}
        >
          <Text style={{ fontFamily: HEADING_FONT, fontSize: 18, fontWeight: 600, margin: "0 0 20px" }}>
            {t("siteName")}
          </Text>
          {children}
          <Hr style={{ borderColor: COLORS.border, margin: "28px 0 16px" }} />
          {footer}
          <Text style={{ color: COLORS.muted, fontSize: 12, margin: "8px 0 0" }}>{t("agency")}</Text>
        </Container>
      </Body>
    </Html>
  );
}

function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: COLORS.primary,
        borderRadius: 999,
        color: COLORS.primaryInk,
        fontSize: 15,
        fontWeight: 600,
        padding: "12px 24px",
      }}
    >
      {children}
    </Button>
  );
}

async function finish(subject: string, element: ReactNode): Promise<RenderedEmail> {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject, html, text };
}

// ── New chat messages ──

export async function chatMessageEmail(input: {
  locale: Locale;
  timeZone: string;
  senderName: string;
  senderAvatarUrl: string | null;
  count: number;
  lastAt: string;
  chatUrl: string;
  unsubscribeUrl: string;
  settingsUrl: string;
}): Promise<RenderedEmail> {
  const t = await translatorFor(input.locale);
  const subject = t("chat.subject", { count: input.count, name: input.senderName });
  const when = formatDate(input.lastAt, input.locale, { dateStyle: "medium", timeStyle: "short" }, input.timeZone);
  const footer = (
    <Text style={{ color: COLORS.muted, fontSize: 12, margin: 0 }}>
      {t("chat.why")}{" "}
      <Link href={input.unsubscribeUrl} style={{ color: COLORS.primary }}>
        {t("chat.unsubscribe")}
      </Link>
      {" · "}
      <Link href={input.settingsUrl} style={{ color: COLORS.primary }}>
        {t("settings")}
      </Link>
    </Text>
  );
  return finish(
    subject,
    <Layout locale={input.locale} preview={subject} t={t} footer={footer}>
      {input.senderAvatarUrl && (
        <Img
          src={input.senderAvatarUrl}
          alt=""
          width={64}
          height={64}
          style={{ borderRadius: 999, border: `2px solid ${COLORS.gold}`, margin: "0 0 12px" }}
        />
      )}
      <Heading as="h1" style={{ fontFamily: HEADING_FONT, fontSize: 22, margin: "0 0 8px" }}>
        {subject}
      </Heading>
      <Text style={{ color: COLORS.muted, fontSize: 14, margin: "0 0 20px" }}>
        {t("chat.sentAt", { count: input.count, time: when })}
      </Text>
      <Section style={{ margin: "0 0 20px" }}>
        <PrimaryButton href={input.chatUrl}>{t("chat.openChat")}</PrimaryButton>
      </Section>
      <Text style={{ color: COLORS.muted, fontSize: 13, margin: 0 }}>{t("chat.privacy")}</Text>
    </Layout>,
  );
}

// ── Chat invitation decided ──

export async function invitationEmail(input: {
  locale: Locale;
  approved: boolean;
  celebrityName: string;
  reason: string | null;
  url: string;
}): Promise<RenderedEmail> {
  const t = await translatorFor(input.locale);
  const name = input.celebrityName;
  const subject = input.approved ? t("invitation.approvedSubject", { name }) : t("invitation.rejectedSubject", { name });
  return finish(
    subject,
    <Layout locale={input.locale} preview={subject} t={t}>
      <Heading as="h1" style={{ fontFamily: HEADING_FONT, fontSize: 22, margin: "0 0 12px" }}>
        {subject}
      </Heading>
      <Text style={{ fontSize: 15, margin: "0 0 16px" }}>
        {input.approved ? t("invitation.approvedBody", { name }) : t("invitation.rejectedBody", { name })}
      </Text>
      {!input.approved && input.reason && (
        <Text style={{ fontSize: 14, margin: "0 0 16px", whiteSpace: "pre-line" }}>
          <strong>{t("invitation.reasonLabel")}</strong> {input.reason}
        </Text>
      )}
      <Section style={{ margin: "4px 0 0" }}>
        <PrimaryButton href={input.url}>
          {input.approved ? t("invitation.openChat") : t("invitation.browse")}
        </PrimaryButton>
      </Section>
    </Layout>,
  );
}

// ── Sign-in code (sent for Supabase Auth through the Send Email Hook) ──

export async function signInCodeEmail(input: { locale: Locale; code: string; minutes: number }): Promise<RenderedEmail> {
  const t = await translatorFor(input.locale);
  const subject = t("signIn.subject");
  return finish(
    subject,
    <Layout locale={input.locale} preview={subject} t={t}>
      <Text style={{ fontSize: 15, margin: "0 0 12px" }}>{t("signIn.intro")}</Text>
      {/* The code reads left to right in every language. */}
      <Text
        dir="ltr"
        style={{
          fontFamily: "ui-monospace, Menlo, Consolas, monospace",
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: 8,
          margin: "0 0 20px",
          textAlign: directionFor(input.locale) === "rtl" ? "right" : "left",
        }}
      >
        {input.code}
      </Text>
      <Text style={{ fontSize: 14, margin: "0 0 8px" }}>{t("signIn.expires", { minutes: input.minutes })}</Text>
      <Text style={{ color: COLORS.muted, fontSize: 13, margin: 0 }}>{t("signIn.ignore")}</Text>
    </Layout>,
  );
}

// ── Auto-response to replies ──

export async function autoReplyEmail(input: { locale: Locale; chatsUrl: string }): Promise<RenderedEmail> {
  const t = await translatorFor(input.locale);
  const subject = t("autoReply.subject");
  return finish(
    subject,
    <Layout locale={input.locale} preview={subject} t={t}>
      <Text style={{ fontSize: 15, margin: "0 0 20px" }}>{t("autoReply.body")}</Text>
      <Section>
        <PrimaryButton href={input.chatsUrl}>{t("autoReply.openChats")}</PrimaryButton>
      </Section>
    </Layout>,
  );
}
