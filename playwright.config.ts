import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { E2E_CRON_SECRET, E2E_SEND_EMAIL_HOOK_SECRET, E2E_WEBHOOK_SECRET } from "./e2e/constants";

const PORT = 3100;

// Local Supabase keys (gitignored). Admin and sign-in tests need them and skip
// without them; see e2e/support.ts.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: [
    {
      // Stand-in for DeepL so translation tests run offline and use no quota.
      command: "node e2e/mock-deepl.mjs 3199",
      url: "http://127.0.0.1:3199/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      // Local QStash: delivers the delayed chat-email checks to the app.
      command: "npx qstash dev -port 8080",
      port: 8080,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Local Supabase Auth sends sign-in codes through the Send Email Hook on
      // :3000 (supabase/config.toml), so a dev server must be up there too.
      command: "npm run dev",
      url: "http://localhost:3000/en",
      reuseExistingServer: true,
      timeout: 120_000,
      env: { EMAIL_TRANSPORT: "mailpit", SEND_EMAIL_HOOK_SECRET: E2E_SEND_EMAIL_HOOK_SECRET },
    },
    {
      command: `npm run build && npm run start -- -p ${PORT}`,
      url: `http://localhost:${PORT}/en`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: {
        // Placeholders when local Supabase isn't configured: public pages still render.
        NEXT_PUBLIC_SUPABASE_URL:
          process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY:
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "test-anon-key",
        NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
        TRANSLATION_API_KEY: "e2e-test-key",
        TRANSLATION_API_URL: "http://127.0.0.1:3199/v2/translate",
        // Emails go to the local Mailpit inbox; chat-email checks run after 3 s.
        EMAIL_TRANSPORT: "mailpit",
        CHAT_EMAIL_DELAY_SECONDS: "3",
        // The QStash dev server's fixed development credentials (not secrets).
        QSTASH_URL: "http://127.0.0.1:8080",
        QSTASH_TOKEN: "eyJVc2VySUQiOiJkZWZhdWx0VXNlciIsIlBhc3N3b3JkIjoiZGVmYXVsdFBhc3N3b3JkIn0=",
        QSTASH_CURRENT_SIGNING_KEY: "sig_7kYjw48mhY7kAjqNGcy6cr29RJ6r",
        QSTASH_NEXT_SIGNING_KEY: "sig_5ZB6DVzB1wjE8S6rZ7eenA8Pdnhs",
        RESEND_WEBHOOK_SECRET: E2E_WEBHOOK_SECRET,
        SEND_EMAIL_HOOK_SECRET: E2E_SEND_EMAIL_HOOK_SECRET,
        CRON_SECRET: E2E_CRON_SECRET,
      },
    },
  ],
});
