import { expect, test } from "@playwright/test";
import ar from "../messages/ar.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import ko from "../messages/ko.json" with { type: "json" };

const CASES = [
  { locale: "en", dir: "ltr", messages: en },
  { locale: "ko", dir: "ltr", messages: ko },
  { locale: "ar", dir: "rtl", messages: ar },
] as const;

for (const { locale, dir, messages } of CASES) {
  test(`home renders in ${locale} (${dir})`, async ({ page }) => {
    await page.goto(`/${locale}`);
    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", locale);
    await expect(html).toHaveAttribute("dir", dir);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages.common.siteName);
    await expect(page.getByRole("link", { name: messages.home.enterWithInvite })).toBeVisible();

    // No horizontal scroll at any width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test.describe("first visit detection", () => {
  // Chromium rewrites Accept-Language from the context locale, so the header
  // rules are checked over plain HTTP and the browser path via `locale`.
  for (const [header, expected] of [
    ["sw-KE, pt-BR;q=0.9, en;q=0.8", "/pt"],
    ["fr-CA,fr;q=0.9", "/fr"],
    ["ar-EG", "/ar"],
    ["sw-KE, yo", "/en"],
    ["", "/en"],
  ] as const) {
    test(`Accept-Language "${header}" redirects / to ${expected}`, async ({ request }) => {
      const response = await request.get("/", {
        headers: { "Accept-Language": header },
        maxRedirects: 0,
      });
      expect(response.status()).toBe(307);
      expect(new URL(response.headers()["location"] ?? "", "http://localhost").pathname).toBe(expected);
    });
  }

  test.describe("in a Brazilian Portuguese browser", () => {
    test.use({ locale: "pt-BR" });

    test("lands on /pt", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/pt$/);
      await expect(page.locator("html")).toHaveAttribute("lang", "pt");
    });
  });

  test("keeps the rest of the path", async ({ request }) => {
    const response = await request.get("/invite/SKCE-7K4M-Q2PX?x=1", {
      headers: { "Accept-Language": "ko-KR" },
      maxRedirects: 0,
    });
    expect(response.headers()["location"]).toMatch(/\/ko\/invite\/SKCE-7K4M-Q2PX\?x=1$/);
  });
});

test("unknown locale segments get a locale prefix", async ({ page }) => {
  const response = await page.goto("/xx");
  expect(page.url()).toMatch(/\/en\/xx$/);
  expect(response?.status()).toBe(404);
});

test.describe("language switcher", () => {
  test.use({ locale: "en-US" });

  test("a manual choice overrides detection and persists", async ({ page, context }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);

    await page.getByRole("button", { name: /Choose language/ }).click();
    await page.getByRole("button", { name: "한국어" }).click();
    await expect(page).toHaveURL(/\/ko$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");

    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === "NEXT_LOCALE")?.value).toBe("ko");

    // Browser still prefers English, but the saved choice wins.
    await page.goto("/");
    await expect(page).toHaveURL(/\/ko$/);
  });

  test("Escape closes the menu", async ({ page }) => {
    await page.goto("/en");
    const toggle = page.getByRole("button", { name: /Choose language/ });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
