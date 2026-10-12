/** Signs the fake Resend webhooks in e2e/email.spec.ts (test-only value). */
export const E2E_WEBHOOK_SECRET = `whsec_${Buffer.from("e2e-webhook-secret").toString("base64")}`;

/** Supabase Auth's Send Email Hook secret (local value from supabase/config.toml). */
export const E2E_SEND_EMAIL_HOOK_SECRET = "v1,whsec_aGFsbHl1LXN0YXJzLWxvY2FsLXNlbmQtZW1haWwtaG9vaw==";

/** Vercel Cron's secret for /api/cron/cleanup (test-only value). */
export const E2E_CRON_SECRET = "e2e-cron-secret";
