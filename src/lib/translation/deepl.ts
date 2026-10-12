import "server-only";
import type { Locale } from "@/i18n/config";

/**
 * DeepL text translation (CLAUDE.md › Translation: server-side only).
 * Works without a key: isTranslationConfigured() is false and callers fall
 * back to hand-written translations.
 */

/** Target codes; three site languages need a regional variant. */
const TARGET: Record<Locale, string> = {
  en: "EN-US",
  ko: "KO",
  es: "ES",
  de: "DE",
  fr: "FR",
  it: "IT",
  th: "TH",
  zh: "ZH-HANS",
  ja: "JA",
  pl: "PL",
  ru: "RU",
  pt: "PT-BR",
  ar: "AR",
};

function apiKey(): string | null {
  return process.env.TRANSLATION_API_KEY?.trim() || null;
}

export function isTranslationConfigured(): boolean {
  return apiKey() !== null;
}

export class TranslationError extends Error {
  constructor(readonly status: number) {
    super(`DeepL request failed (${status})`);
  }
}

/**
 * Free-plan keys end in ":fx" and use a different host. TRANSLATION_API_URL
 * overrides both; only the e2e tests set it (to a local stand-in).
 */
export function deeplEndpoint(key: string): string {
  const override = process.env.TRANSLATION_API_URL?.trim();
  if (override) return override;
  return key.endsWith(":fx") ? "https://api-free.deepl.com/v2/translate" : "https://api.deepl.com/v2/translate";
}

/** Translate one text from `source` into `target`. */
export async function translateText(text: string, source: Locale, target: Locale): Promise<string> {
  const key = apiKey();
  if (!key) throw new Error("TRANSLATION_API_KEY is not set");
  if (source === target || !text.trim()) return text;

  const response = await fetch(deeplEndpoint(key), {
    method: "POST",
    headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: [text],
      source_lang: source.toUpperCase(),
      target_lang: TARGET[target],
      preserve_formatting: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  // Status only: the text itself must not reach logs.
  if (!response.ok) throw new TranslationError(response.status);
  const body = (await response.json()) as { translations: { text: string }[] };
  return body.translations[0]?.text ?? "";
}

export type DetectedTranslation = { text: string; detected: string };

/**
 * Translate several texts into `target`, letting DeepL detect each source
 * language. `detected` is DeepL's lowercase base language (e.g. "ko"), so a
 * text already in the target language can be recognised.
 */
export async function translateMany(texts: string[], target: Locale): Promise<DetectedTranslation[]> {
  const key = apiKey();
  if (!key) throw new Error("TRANSLATION_API_KEY is not set");
  if (!texts.length) return [];

  const response = await fetch(deeplEndpoint(key), {
    method: "POST",
    headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: texts, target_lang: TARGET[target], preserve_formatting: true }),
    signal: AbortSignal.timeout(15_000),
  });
  // Status only: the text itself must not reach logs.
  if (!response.ok) throw new TranslationError(response.status);
  const body = (await response.json()) as { translations: { text: string; detected_source_language?: string }[] };
  return body.translations.map((t) => ({
    text: t.text,
    detected: (t.detected_source_language ?? "").toLowerCase().split("-")[0] ?? "",
  }));
}
