# CLAUDE.md — Hallyu Stars

Guidance for Claude Code when building this project. Read this before making changes.

## Project overview

**Hallyu Stars** (`hallyustars.org`) is an invitation-only website run by **South Korea Culture and Entertainment**, a South Korean tourism and culture agency. Selected fans can chat privately with Korean celebrities. Every chat must be approved by an admin first.

- The site celebrates Korean cultural heritage and entertainment (see **Design**).
- Fans come from many countries: the UI supports 13 languages and every time is shown in the viewer's own timezone.
- Privacy and trust are core requirements: email addresses are never exposed in chat, ID documents are private, and every admin action is logged.

Design mockup of the landing page: https://claude.ai/artifact/B34QT8DkQCt9wUDVmiWwGA

Planning conversation where these decisions were made: https://claude.ai/code/session_01PyvEncRVfSxkhuLJDYrPSX
(For human reference. Claude Code cannot open claude.ai conversation links, so this file is the source of truth. Where the conversation and this file differ, follow this file — it records the final decisions after all corrections.)

## Roles

There are exactly three roles.

| Role | Can do |
|---|---|
| `admin` | Everything: manage other admins, platform settings, invites, fan approval, celebrity profiles, chat invitation review, moderation, audit log |
| `celebrity` | Log in and chat in conversations an admin has approved. Cannot approve invitations. |
| `fan` | Register via invite, browse/search celebrity profiles, send chat invitations, chat once approved |

All admins have full permissions. Every admin action is still written to `audit_logs` with the acting admin's ID.

Minors are out of scope: an external selection committee vets fans before they are invited. Do not build age-gating.

## Core flows

### 1. Invites (admin)
1. The selection committee chooses fans outside the platform and gives the admin names and email addresses.
2. The admin creates invites **one at a time** (fan name + email) in the dashboard.
3. The system generates an invite code and link and shows both with copy buttons. **The platform does not email the invite**; the committee emails the fan the link, code and website address.
4. Admin can revoke an invite or regenerate its code.

**Invite code rules**
- Format: `SKCE-XXXX-XXXX` (fixed prefix + 8 random characters).
- Alphabet: `23456789ABCDEFGHJKMNPQRSTUVWXYZ` — no `0 O 1 I L`.
- Input is case-insensitive; spaces and dashes are ignored. Normalize before lookup and store without dashes (`SKCE7K4MQ2PX`). Accept input with or without the `SKCE` prefix.
- Generate with a cryptographically secure RNG; enforce uniqueness in the DB.
- Single use. Default expiry 14 days (admin-configurable in platform settings).
- Invite link format: `https://hallyustars.org/invite/SKCE-XXXX-XXXX` (pre-fills the code).

### 2. Registration (fan)
1. Fan clicks **"Enter with your invite"** and enters the invite code.
2. If the code is valid, they enter their email.
3. The email **must match** the email the admin used for that invite. If not, show **"Incorrect email"** and stay on the step. After 5 wrong emails, lock the invite for 1 hour.
4. Email OTP (6 digits) is sent and verified.
5. **Profile picture upload** (normal upload, not a live selfie) with a crop tool and preview.
6. **ID upload** (passport, national ID or driver's license).
7. Account status becomes `pending_review`. An admin compares profile picture with the ID photo and approves or rejects (with reason).
8. If a fan leaves mid-way, re-entering the same code + email resumes where they stopped.
9. Changing the profile picture later sends it back to admin review.

**Invite error messages** (translated)
| Case | Message |
|---|---|
| Unknown code | "This invite code isn't valid. Check the code in your invitation email." |
| Already used | "This invite has already been used. If this is your account, sign in instead." |
| Expired | "This invite has expired. Contact South Korea Culture and Entertainment for a new one." |
| Revoked | "This invite is no longer valid." |
| Email mismatch | "Incorrect email. Use the email address your invitation was sent to." |

### 3. Photo and ID uploads
- Accepted formats: **JPG, PNG, HEIC**. Max **25 MB**.
- Error message for wrong type: "Please choose a photo (JPG, PNG or HEIC)."
- Uploads go **directly from the browser to storage** via short-lived signed upload URLs (Vercel functions reject bodies over 4.5 MB — never proxy files through API routes).
- JPG/PNG: resize in the browser to max 2000 px on the longest side, re-encode as JPG before upload.
- HEIC: upload as-is, convert to JPG server-side with `heic-convert` (standard `sharp` builds cannot decode HEIC). Most browsers cannot display HEIC, so **everything is stored as JPG**.
- Strip EXIF/GPS metadata from all images.
- Profile pictures: generate a 400×400 version for display.
- ID images: keep ~2000 px for legibility, store in a **private** bucket, accessible only to admins via short-lived signed URLs. Delete ID images automatically 30 days after the approval decision; keep only the verification record.

### 4. Celebrity profiles and discovery
- Admins create/edit celebrity profiles: stage name, photo, bio, category (e.g. K-pop, actor), group, languages spoken, timezone, `accepts_invites` flag, and link to the celebrity's login account.
- Admin writes the bio in Korean or English; it is auto-translated into the other languages and each translation is editable.
- Approved fans can search and filter profiles (category, group, open to invitations). Postgres full-text search is enough to start.

### 5. Chat invitations
- An approved fan sends an invitation with a short message.
- States: `pending → approved | rejected`, plus `withdrawn` (by fan) and `expired`.
- **Only admins approve or reject.** Approval creates a 1:1 conversation.

### 6. Chat
- Google Chat–style 1:1 real-time chat: messages, typing indicator, read receipts, online status, emoji reactions, image sharing, history, date dividers.
- **Message translation**: each message can be shown in the reader's selected language with a "View original" toggle (DeepL or Papago API, called server-side; cache translations).
- Chat header shows the other person's local time, e.g. "It's 11:40 PM in Seoul".
- Celebrity messages show a verified badge.
- **Moderation**: users can report and block from any chat; admins review reports and can read flagged conversations. Messages are **not** automatically filtered for contact details (decided against after it was built; do not re-add).
- **Chat never exposes email addresses** (see Privacy rules).

### 7. Email notifications
Fans and celebrities get an email when they receive a chat message, using these rules:
1. If the recipient currently has that chat open (presence), send nothing.
2. Otherwise schedule a check 5 minutes later (Upstash QStash delayed call to our API route). If the message is still unread, send one email: "New message from [Display Name]".
3. At most one email per conversation per hour; later emails summarize: "You have 3 new messages from [Display Name]".
4. Reading the chat cancels pending notifications for it.

Email content rules:
- **No message text** in the email. Show sender display name and photo, time in the recipient's timezone, and an "Open chat" button.
- The chat link requires login.
- Sent to one recipient at a time — never CC/BCC lists.
- From `notifications@hallyustars.org`, no-reply. Replies get an auto-response pointing to the website.
  - Every email sets `Reply-To: no-reply+<locale>@reply.hallyustars.org` (the recipient's saved locale, e.g. `no-reply+ar@…`), so the auto-response is in their language; untagged or unknown tags get English.
  - `reply.hallyustars.org` is its own Resend domain with receiving on (Resend MX on the subdomain only). Resend posts an `email.received` webhook to our API route (verify the webhook signature); the route sends the auto-response through Resend, from `no-reply@reply.hallyustars.org`. Never read, store or log the reply's content; the webhook carries no headers or body, so skip senders and subjects that look automated (bounces, out-of-office, no-reply addresses), and answer each sender at most once a day.
  - Mail to `hallyustars.org` itself (e.g. `admin@`) uses Cloudflare Email Routing (root-domain MX), forwarded to the agency's own inboxes. No mailbox is hosted; the site never reads this mail. Resend's MX records stay on `send.` and `reply.` only.
- Written in the recipient's saved site language; RTL layout for Arabic.
- Every email has a one-click unsubscribe link (required by Gmail/Yahoo).
- Users have an on/off toggle for chat emails. Invitation status emails (approved/rejected) are always sent.
- **There is no daily digest.** Do not build one.
- The sign-in code email is sent by us too: Supabase Auth's Send Email Hook posts the code to `/api/auth/send-email`, which emails it (Resend, React Email) in the language of the page the code was asked from, else the saved locale, else English. Never log the code.

## Internationalization

Supported locales (13): `en`, `ko`, `es`, `de`, `fr`, `it`, `th`, `zh`, `ja`, `pl`, `ru`, `pt`, `ar`.

**Automatic detection**
- Walk the browser's ordered preference list (`Accept-Language` / `navigator.languages`) and pick the **first supported** language, matching on the base language (`pt-BR` → `pt`, `fr-CA` → `fr`).
- If nothing matches, use `en`.

```ts
const SUPPORTED = ["en","ko","es","de","fr","it","th","zh","ja","pl","ru","pt","ar"] as const;

export function detectLocale(browserLangs: readonly string[]) {
  for (const lang of browserLangs) {
    const base = lang.toLowerCase().split("-")[0];
    if ((SUPPORTED as readonly string[]).includes(base)) return base;
  }
  return "en";
}
```

**Manual switcher**
- Globe button in the top-right of every page; dropdown lists each language in its own script (English, 한국어, Español, Deutsch, Français, Italiano, ไทย, 中文, 日本語, Polski, Русский, Português, العربية).
- A manual choice always overrides detection: store in a cookie for visitors and on the user profile once logged in.

**Implementation**
- `next-intl` with locale routing: `/ko/...`, `/fr/...`.
- Arabic: set `dir="rtl"` on `<html>`. Use Tailwind logical utilities (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`) everywhere — never `ml-`/`mr-`/`left-`/`right-` for layout. Decorative patterns must mirror correctly.
- Fonts: Noto family for coverage (see Design); load only the active script's font.
- All user-facing strings live in message files; no hard-coded UI text.

## Time and dates

- Store every timestamp in UTC (`timestamptz`). The server never formats times for display; it sends ISO UTC strings.
- Format in the browser with `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat` using the **active site locale** and the **device timezone**.
- Chat: "Just now" / "5 min ago" for recent messages (refresh every minute), time of day for today, date dividers ("Today", "Yesterday", weekday + date), full date/time with timezone in a tooltip.
- Save each user's IANA timezone (e.g. `Africa/Lagos`, `Asia/Seoul`) on their profile at signup and update it silently on login. Use it for server-generated emails and for the "local time" in the chat header. Never store fixed offsets.
- Thai locale defaults to the Buddhist calendar; Arabic may use Eastern Arabic digits. Keep the defaults unless the agency decides otherwise.
- Use one shared `formatDate` / `formatRelative` utility everywhere.

## Privacy and security rules (must follow)

- **Email addresses never leave the account system.** Chat tables reference users by ID only. Chat APIs and realtime payloads return display name, avatar, verified flag and timezone — never email. Enforce with Supabase RLS policies and dedicated views, not just front-end code.
- Only admins can view emails and ID documents; log each view in `audit_logs`.
- ID images in a private bucket, signed URLs only, auto-deleted after 30 days.
- Strip image metadata.
- Rate-limit OTP requests, invite code lookups and login attempts.
- Admin accounts should use MFA.
- Admin rights also need a live session: signing out elsewhere or an authenticator reset (Settings) ends them at once, not when the token expires. Admins are never deleted (the audit log points at them); removing access suspends the account.
- An admin's own profile edits (name, language, timezone) are not admin actions and aren't written to `audit_logs`.
- Never log message bodies, OTP codes, invite codes or ID file paths in application logs.

## Admin dashboard modules

1. **Invites** — create (name + email), shows code/link with copy buttons; table with status (`created`, `registering`, `pending_review`, `approved`, `rejected`, `expired`, `revoked`), created by, expiry; revoke / regenerate actions.
2. **Fan verification queue** — profile picture and ID side by side; approve/reject with reason; profile-picture change reviews.
3. **Celebrities** — profiles, translations, availability, linked login.
4. **Chat invitations** — review queue with approve/reject.
5. **Moderation** — flagged messages, reports, blocks, suspensions.
6. **Analytics** — invites sent/used, approvals, active chats, response times, fan countries.
7. **Settings** — admins, invite expiry, other platform settings.
8. **Audit log** — every admin action with UTC timestamp.

Admin times display in the admin's own timezone.

## Data model (initial)

```
users (id, role, email, display_name, avatar_url, status, locale, timezone, created_at)
celebrity_profiles (id, user_id, stage_name, category, group_name, languages[], accepts_invites, photo_url)
celebrity_profile_translations (profile_id, locale, bio, is_machine_translated)
invites (id, fan_name, email, code, status, created_by_admin, expires_at, used_at,
         failed_email_attempts, locked_until)
verifications (id, user_id, profile_photo_path, id_document_path, status, reviewed_by, reason,
               decided_at, id_deleted_at)
chat_invitations (id, fan_id, celebrity_id, message, status, decided_by_admin, decided_at)
conversations (id, chat_invitation_id, created_at)
conversation_members (conversation_id, user_id, last_read_at)
messages (id, conversation_id, sender_id, body, attachments, flagged, created_at)
message_translations (message_id, locale, body)
reactions (message_id, user_id, emoji)
reports (id, reporter_id, message_id, conversation_id, reason, status, handled_by)
blocks (blocker_id, blocked_id)
notification_preferences (user_id, chat_emails_enabled, invitation_emails_enabled)
email_log (id, user_id, type, conversation_id, status, sent_at)
platform_settings (key, value)
audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
```

All timestamps `timestamptz` (UTC). Chat-related tables must not join to `users.email` in any non-admin path.

## Tech stack

| Need | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript (strict) |
| Styling | Tailwind CSS with logical properties for RTL |
| i18n | `next-intl` |
| Database | Supabase Postgres (US East, `us-east-1`) with Row Level Security |
| Auth | Supabase Auth (email OTP for fans; admins with MFA) |
| Realtime chat | Supabase Realtime (messages, typing, presence) |
| File storage | Supabase Storage (public bucket for avatars, private bucket for IDs) |
| Delayed jobs | Upstash QStash (notification checks) |
| Email | Resend, templates in React Email |
| Translation | DeepL or Papago API (server-side, cached) |
| Image processing | browser canvas resize; `heic-convert` server-side for HEIC |
| Testing | Vitest (unit), Playwright (end-to-end, including RTL and locale tests) |

Do **not** use Socket.IO, BullMQ, or any long-running server process — the app runs on Vercel serverless functions.

## Deployment

- Hosted on **Vercel (Pro plan)**, connected to GitHub. Push to `main` deploys production; every branch/PR gets a preview deployment.
- Domain: `hallyustars.org` (primary, no `www`); `www.hallyustars.org` redirects to it.
- Function region: Washington, D.C. (`iad1`), next to Supabase `us-east-1` (most fans are in the US and EU). Resend sending region: `us-east-1`.
- Preview deployments use a **separate staging** Supabase project and storage — never production data. Deployment Protection is enabled on previews.
- Environment variables are set in the Vercel dashboard per environment (Production / Preview). Never commit secrets. Keep `.env.example` up to date.
- A daily Vercel Cron job (`vercel.json` → `/api/cron/cleanup`, 04:00 UTC) deletes ID images after the retention period and removes abandoned registrations (settings on the admin Settings page).
- Database migrations run as a controlled step (GitHub Action on merge to `main`), not inside every Vercel build.
- Email sending domain `hallyustars.org` must have SPF, DKIM and DMARC records.

Expected environment variables:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
QSTASH_TOKEN
QSTASH_CURRENT_SIGNING_KEY
QSTASH_NEXT_SIGNING_KEY
RESEND_API_KEY
RESEND_WEBHOOK_SECRET         # signs the email.received webhook
SEND_EMAIL_HOOK_SECRET        # signs Supabase Auth's Send Email Hook (sign-in code emails)
TRANSLATION_API_KEY
CRON_SECRET                   # Vercel Cron → /api/cron/cleanup (daily: ID images, abandoned registrations)
NEXT_PUBLIC_SITE_URL          # https://hallyustars.org in production
```

Verify QStash signatures on every callback route.

## Design

Concept: **"Hanok by day, Seoul by night."** Light mode = traditional heritage; dark mode = neon Seoul / K-pop concert energy. Follow the mockup linked above.

**Brand**
- Agency name: **South Korea Culture and Entertainment**. Site name: **Hallyu Stars**.
- Logo: the official South Korean government emblem. Use only the official SVG supplied by the agency, unmodified, following its clear-space and color rules. Do not redraw it.

**Color tokens**
| Token | Day | Night |
|---|---|---|
| bg | `#F7F3EA` (hanji) | `#0E1026` |
| surface | `#FFFDF8` | `#171A36` |
| band | `#EFE7D8` | `#12153A` |
| ink | `#1E1B18` | `#EDEBF5` |
| muted | `#5C554C` | `#A9A6C4` |
| border | `#E2D8C5` | `#2A2E55` |
| primary | `#3F7A69` (celadon jade) | `#FF4FA3` (lightstick pink) |
| primary-ink (text on primary) | `#FFFFFF` | `#1A0B14` |
| accent | `#B83A2B` (dancheong red) | `#FF5C7A` |
| gold | `#C9982F` | `#F2C14E` |

Obangsaek accents for trims and patchwork: `#1F4E79` blue, `#B83A2B` red, `#D9A93F` yellow, `#E9E1CF` white, `#1E1B18` black. Use saturated colors only for buttons, badges and small details. All text must pass WCAG AA contrast.

**Typography**
- Headings: Noto Serif KR (Noto Serif SC / JP / Thai, Noto Naskh Arabic for those locales).
- UI text: IBM Plex Sans KR (Noto Sans Thai / Arabic fallbacks). Pretendard is an acceptable alternative.

**Motifs and key UI moments**
- Hanok roofline (처마) curve as section dividers; faint hanji texture; bojagi patchwork; dancheong trims.
- Celebrity cards look like K-pop photocards (gold border, verified badge).
- Approved invitations get a red dojang seal stamp "승인 / APPROVED".
- Celebrity chat bubbles: jade tint (day) / violet-bordered (night). Typing dots pulse like lightsticks.
- Use only Korean motifs — no Japanese or Chinese elements. Do not use the national flag decoratively.
- Respect `prefers-reduced-motion`.
- Admin dashboard: clean and efficient; heritage only in accents.

## Code conventions

- TypeScript strict mode; no `any` without a comment explaining why.
- Validate all API input with Zod.
- Server-only code (service role key, translation API, email) must never be imported into client components.
- Every new user-facing string goes into all 13 locale message files (English source; machine translation acceptable as a placeholder, marked for review).
- Test every new screen in `en`, `ko` and `ar` (RTL) at desktop and mobile widths.
- Every admin mutation writes an `audit_logs` row in the same transaction.
- Keep migrations small and reversible.
