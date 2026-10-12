import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import ar from "../messages/ar.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import fr from "../messages/fr.json" with { type: "json" };
import ko from "../messages/ko.json" with { type: "json" };
import {
  createAccount,
  expectNoHorizontalScroll,
  hasLocalSupabase,
  serviceClient,
  signInAsNewAdmin,
  signInWithEmailCode,
} from "./support";

test.skip(!hasLocalSupabase, "needs local Supabase: npm run db:start and .env.local");

const d = en.discover;
const HANEUL = "d0000000-0000-4000-8000-000000000001";

/** A word no other test's data contains, so searches only find this test's stars. */
const uniqueWord = () => Array.from(randomBytes(10), (b) => String.fromCharCode(97 + (b % 26))).join("");

async function insertProfile(fields: Record<string, unknown>) {
  const { data, error } = await serviceClient().from("celebrity_profiles").insert(fields).select("id").single();
  if (error) throw error;
  return data.id as string;
}

const results = (page: Page) => page.getByRole("main").getByRole("status");
const card = (page: Page, name: string) => page.getByRole("main").getByRole("link", { name: new RegExp(name) });

/** Wait for the page to finish starting up before typing, then submit the form. */
async function submitFilters(page: Page) {
  await page.getByRole("button", { name: d.search }).click();
  await page.waitForLoadState("networkidle");
}

async function search(page: Page, q: string) {
  await page.waitForLoadState("networkidle");
  await page.getByLabel(d.searchLabel).fill(q);
  await submitFilters(page);
  if (q) await expect(page).toHaveURL(new RegExp(`[?&]q=${encodeURIComponent(q)}`));
}

test("an approved fan searches and filters celebrities", async ({ page }, testInfo) => {
  const word = uniqueWord();
  const troupe = `Troupe${word}`;
  await insertProfile({ stage_name: `Nova${word}`, category: "athlete", group_name: troupe, accepts_invites: true });
  await insertProfile({ stage_name: `Luna${word}`, category: "singer", group_name: troupe, accepts_invites: false });

  await signInWithEmailCode(page, "en", await createAccount("fan", testInfo));
  await expect(page).toHaveURL(/\/en\/celebrities$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(d.title);

  // Group name, then the start of a stage name.
  await search(page, troupe.toLowerCase());
  await expect(results(page)).toHaveText("2 celebrities");
  await expect(card(page, `Nova${word}`)).toBeVisible();
  await expect(card(page, `Luna${word}`)).toBeVisible();

  await search(page, `luna${word.slice(0, 6)}`);
  await expect(results(page)).toHaveText("1 celebrity");
  await expect(card(page, `Luna${word}`)).toBeVisible();

  // Category and group filters.
  await search(page, "");
  await page.getByLabel(d.group, { exact: true }).selectOption(troupe);
  await page.getByLabel(d.category).selectOption({ label: en.common.categories.athlete });
  await submitFilters(page);
  await expect(results(page)).toHaveText("1 celebrity");
  await expect(card(page, `Nova${word}`)).toBeVisible();

  // Neither is open to invitations: Nova accepts them but has no login yet.
  await page.getByLabel(d.category).selectOption("");
  await page.getByLabel(d.openOnly).check();
  await submitFilters(page);
  await expect(results(page)).toHaveText("No celebrities found");
  await expect(page.getByText(d.noResults)).toBeVisible();

  await page.getByRole("link", { name: d.clear }).click();
  await expect(page).toHaveURL(/\/en\/celebrities$/);
  await expect(page.getByLabel(d.openOnly)).not.toBeChecked();

  // Haneul (seed) has a login and accepts invitations.
  await page.getByLabel(d.openOnly).check();
  await search(page, "haneul");
  await expect(card(page, "Haneul")).toContainText(d.invitesOpen);
  await expectNoHorizontalScroll(page);
});

test("a profile shows the bio in the fan's language, with the original", async ({ page }, testInfo) => {
  const name = `Sol${uniqueWord()}`;
  const id = await insertProfile({
    stage_name: name,
    category: "actor",
    languages: ["ko", "en"],
    timezone: "Asia/Seoul",
    bio_source_locale: "ko",
  });
  const { error } = await serviceClient()
    .from("celebrity_profile_translations")
    .insert([
      { profile_id: id, locale: "ko", bio: "안녕하세요, 팬 여러분!", is_machine_translated: false },
      { profile_id: id, locale: "fr", bio: "Bonjour à tous les fans !", is_machine_translated: true },
    ]);
  if (error) throw error;

  await signInWithEmailCode(page, "fr", await createAccount("fan", testInfo));
  await expect(page).toHaveURL(/\/fr\/celebrities$/);
  await page.goto(`/fr/celebrities/${id}`);

  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
  await expect(page.getByRole("img", { name: fr.discover.verified }).first()).toBeVisible();
  await expect(page.getByText(fr.discover.invitesClosed)).toBeVisible();
  await expect(page.getByText(/^Heure locale : /)).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "한국어" })).toBeVisible();

  await expect(page.getByText("Bonjour à tous les fans !")).toBeVisible();
  await expect(page.getByText("안녕하세요, 팬 여러분!")).toBeHidden();
  await page.getByText(fr.discover.viewOriginal).click();
  await expect(page.getByText("안녕하세요, 팬 여러분!")).toBeVisible();

  // No English text: English readers get the Korean original, with nothing to toggle.
  await page.goto(`/en/celebrities/${id}`);
  await expect(page.getByText("안녕하세요, 팬 여러분!")).toBeVisible();
  await expect(page.getByText(d.viewOriginal)).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test.describe("who can browse", () => {
  test("signed-out visitors are sent to sign in", async ({ page }) => {
    await page.goto("/en/celebrities");
    await expect(page).toHaveURL(/\/en\/sign-in$/);
  });

  test("fans still in review are sent to their registration", async ({ page }, testInfo) => {
    await signInWithEmailCode(page, "en", await createAccount("fan", testInfo, "pending_review"));
    await expect(page).toHaveURL(/\/en\/register$/);
    await page.goto(`/en/celebrities/${HANEUL}`);
    await expect(page).toHaveURL(/\/en\/register$/);
  });

  test("celebrities can't browse other profiles", async ({ page }, testInfo) => {
    await signInWithEmailCode(page, "en", await createAccount("celebrity", testInfo));
    await expect(page).toHaveURL(/\/en\/chats$/);
    const response = await page.goto("/en/celebrities");
    expect(response?.status()).toBe(404);
  });

  test("admins can see what fans see", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "authenticator set-up is slow; desktop covers it");
    await signInAsNewAdmin(page, "en", await createAccount("admin", testInfo));
    await page.goto(`/en/celebrities/${HANEUL}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Haneul");
    await page.getByRole("link", { name: en.admin.title }).click();
    await expect(page).toHaveURL(/\/en\/admin\/invites$/);
  });
});

for (const { locale, dir, messages } of [
  { locale: "ko", dir: "ltr", messages: ko },
  { locale: "ar", dir: "rtl", messages: ar },
] as const) {
  test(`discovery in ${locale} (${dir})`, async ({ page }, testInfo) => {
    await signInWithEmailCode(page, locale, await createAccount("fan", testInfo));
    await expect(page).toHaveURL(new RegExp(`/${locale}/celebrities$`));
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages.discover.title);
    await expectNoHorizontalScroll(page);
    // Search: earlier test runs leave many stars, so Haneul may not be on page 1.
    await page.goto(`/${locale}/celebrities?q=haneul`);
    await expect(card(page, "Haneul")).toBeVisible();
    await expectNoHorizontalScroll(page);

    await card(page, "Haneul").click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Haneul");
    await expect(page.getByRole("heading", { name: messages.discover.about })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
}
