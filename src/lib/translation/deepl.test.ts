import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { deeplEndpoint, isTranslationConfigured, translateMany, translateText, TranslationError } = await import("./deepl");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("deepl", () => {
  it("is off without a key", () => {
    vi.stubEnv("TRANSLATION_API_KEY", "");
    expect(isTranslationConfigured()).toBe(false);
  });

  it("uses the free host for :fx keys", () => {
    expect(deeplEndpoint("abc:fx")).toBe("https://api-free.deepl.com/v2/translate");
    expect(deeplEndpoint("abc")).toBe("https://api.deepl.com/v2/translate");
  });

  it("sends the right language codes and returns the translation", async () => {
    vi.stubEnv("TRANSLATION_API_KEY", "secret:fx");
    const fetchMock = stubFetch(Response.json({ translations: [{ text: "Olá" }] }));

    await expect(translateText("안녕하세요", "ko", "pt")).resolves.toBe("Olá");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api-free.deepl.com/v2/translate");
    expect(init.headers.Authorization).toBe("DeepL-Auth-Key secret:fx");
    expect(JSON.parse(init.body)).toMatchObject({ text: ["안녕하세요"], source_lang: "KO", target_lang: "PT-BR" });
  });

  it.each([
    ["en", "EN-US"],
    ["zh", "ZH-HANS"],
    ["ar", "AR"],
    ["th", "TH"],
  ] as const)("targets %s as %s", async (locale, code) => {
    vi.stubEnv("TRANSLATION_API_KEY", "secret");
    const fetchMock = stubFetch(Response.json({ translations: [{ text: "x" }] }));
    await translateText("text", "ko", locale);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).target_lang).toBe(code);
  });

  it("doesn't call DeepL for the same language", async () => {
    vi.stubEnv("TRANSLATION_API_KEY", "secret");
    const fetchMock = stubFetch(Response.json({}));
    await expect(translateText("Hello", "en", "en")).resolves.toBe("Hello");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports failures by status only", async () => {
    vi.stubEnv("TRANSLATION_API_KEY", "secret");
    stubFetch(new Response("quota exceeded", { status: 456 }));
    const error = await translateText("Hello", "en", "ko").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TranslationError);
    expect((error as Error).message).toBe("DeepL request failed (456)");
  });

  it("translates several texts at once and reports each detected language", async () => {
    vi.stubEnv("TRANSLATION_API_KEY", "secret");
    const fetchMock = stubFetch(
      Response.json({
        translations: [
          { text: "Hello", detected_source_language: "KO" },
          { text: "Bonjour", detected_source_language: "EN-GB" },
        ],
      }),
    );
    await expect(translateMany(["안녕", "Hi"], "en")).resolves.toEqual([
      { text: "Hello", detected: "ko" },
      { text: "Bonjour", detected: "en" },
    ]);
    const sent = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(sent).toMatchObject({ text: ["안녕", "Hi"], target_lang: "EN-US" });
    expect(sent.source_lang).toBeUndefined();
  });

  it("makes no request for an empty batch", async () => {
    vi.stubEnv("TRANSLATION_API_KEY", "secret");
    const fetchMock = stubFetch(Response.json({}));
    await expect(translateMany([], "fr")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
