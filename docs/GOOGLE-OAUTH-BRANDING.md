# Google OAuth branding — making the sign-in screen say "SuitedPoker"

**Goal.** Google's sign-in screen currently reads *"to continue to
mavyvyhytbdutdfpjnvm.supabase.co"*. After this it reads *"to continue to
SuitedPoker"*, with our logo and a Developer Information panel.

**No code changes.** `signInWithOAuth` in
`src/app/(marketing)/(auth)/google-button.tsx` is already correct. What Google
displays comes from the OAuth client's branding, not from our app.

**This does NOT require the Supabase custom-domain add-on.** The redirect URI
stays `https://mavyvyhytbdutdfpjnvm.supabase.co/auth/v1/callback` throughout.
The browser address bar will still show that host mid-redirect — only a custom
domain changes that, and it is a separate decision.

---

## For an AI browser agent

Read this whole section before acting.

### Rules

1. **Do not enter passwords, 2FA codes, or any credential.** The human signs
   into Google first and hands you an authenticated browser. If you hit a login
   or consent prompt, stop and hand back.
2. **Do not create a new OAuth client.** The existing one is wired into
   Supabase; a new client breaks Google sign-in until Supabase is updated.
   You are editing branding on the client that already exists.
3. **Stop and confirm before these three**, each marked ⚠️ below: editing DNS,
   publishing the app, submitting for verification.
4. **Report the exact on-screen text** when a step's UI does not match this
   document. Google renames these screens often. Do not improvise a path that
   looks similar.

### Prerequisites (human, before handing over)

- Signed into the Google account that **owns the GCP project** holding the
  OAuth client.
- Access to DNS for `suitedpoker.com` (Phase 1 may need a TXT record).
- Decide the support email — see the gotcha in Phase 2.

---

## Phase 0 — Identify the right project

Editing the wrong GCP project silently does nothing.

1. Go to `https://supabase.com/dashboard` → project `mavyvyhytbdutdfpjnvm` →
   **Authentication → Sign In / Providers → Google**.
2. Record the **Client ID** (looks like `NNNNNN-xxxx.apps.googleusercontent.com`).
   Do **not** record or echo the Client Secret.
3. Go to `https://console.cloud.google.com/auth/clients`.
4. Use the project picker in the top bar to find the project whose client list
   contains that Client ID. **That is the project for every later step.**
5. Report the project name and number before continuing.

---

## Phase 1 — Verify the domain in Google Search Console

The Authorized domains field silently rejects unverified domains, so this comes
first.

1. Go to `https://search.google.com/search-console`.
2. If `suitedpoker.com` already appears as a property, skip to Phase 2 and
   report that it was already verified.
3. **Add property → Domain** (not "URL prefix"). A Domain property covers every
   subdomain, which matters if we later add `auth.suitedpoker.com`.
4. Enter `suitedpoker.com`. Google shows a TXT record.
5. ⚠️ **Stop. Show the human the exact TXT value and wait.** DNS is theirs to
   change. They add it at the registrar; DNS can take up to an hour.
6. Once they confirm, click **Verify**.

---

## Phase 2 — Branding

Go to `https://console.cloud.google.com/auth/branding`.

| Field | Value |
|---|---|
| App name | `SuitedPoker` |
| User support email | see gotcha below |
| App logo | upload `public/brand/icon-192.png` (192×192 PNG, square, ~10KB) |
| App home page | `https://suitedpoker.com` |
| Privacy policy link | `https://suitedpoker.com/legal/privacy` |
| Terms of service link | `https://suitedpoker.com/legal/terms` |
| Authorized domain | `suitedpoker.com` |
| Developer contact email | an address the human monitors |

**App name gotcha.** It must not imply it is a Google product and must match
the name on the site. `SuitedPoker` matches the site title, so this is fine.

**Support email gotcha — expect to hit this.** The dropdown only offers the
signed-in Google account's own address, or a Google Group that account owns. If
`suitedpoker.com` mail is not on Google Workspace, `support@suitedpoker.com`
**will not appear as an option.** Do not try to force it. Select the owner's
Google account address, then report that the on-domain address was unavailable
— brand verification is carried by the authorized domain and the home page,
privacy and terms links, all of which are on `suitedpoker.com`.

**Logo gotcha.** Google rejects a logo whose file is over 1MB or not square.
`icon-192.png` is both. Uploading a logo is what triggers the verification
review in Phase 4 — that is intended, not a mistake.

Save. Confirm the page reports the branding as saved before continuing.

---

## Phase 3 — Audience

Go to `https://console.cloud.google.com/auth/audience`.

1. Read the current **Publishing status**. Expect `Testing`.
2. Read **User type**. It should be `External`. If it is `Internal`, stop and
   report — Internal means a Workspace-only app and the whole approach differs.
3. ⚠️ **Stop and confirm with the human, then click "Publish app"** and accept
   the "Push to production?" dialog.

   *Why it is safe:* we request only `email`, `profile`, `openid` — all
   non-sensitive. Publishing removes the 100-test-user cap and the "Google
   hasn't verified this app" interstitial. It does not expose any new data.

   *Why it matters:* an app left in `Testing` shows the raw redirect host. This
   is the step most people miss.

4. Confirm the status now reads `In production`.

---

## Phase 4 — Verification

Go to `https://console.cloud.google.com/auth/verification`.

1. If it says no verification is required, record that and go to Phase 5 — with
   only non-sensitive scopes, the name may already display.
2. If it asks for brand verification, review the prefilled answers. They should
   reference `suitedpoker.com` and the live privacy and terms pages.
3. ⚠️ **Stop, show the human the full submission, and wait for approval before
   clicking Submit.** This sends our details to Google for review and is not
   something to fire off unattended.
4. After submitting, record the expected turnaround (typically a few business
   days). Google emails the developer contact.

---

## Phase 5 — Verify the result

Do this in a **fresh incognito window** — the consent screen is cached hard.

1. Go to `https://suitedpoker.com/login`.
2. Click **Continue with Google**.
3. Read the line under "Sign in".

| What it says | Meaning |
|---|---|
| `to continue to SuitedPoker` | Done. Capture a screenshot. |
| `to continue to mavyvyhytbdutdfpjnvm.supabase.co` | Branding not yet applied — most often Phase 3 was not completed, or review is still pending. Re-check publishing status before changing anything else. |

4. **Do not sign in.** Stop at the account chooser and hand back — the check is
   the text on that screen, and nothing beyond it needs to be exercised.

---

## What this does not fix

The address bar during the redirect still shows
`mavyvyhytbdutdfpjnvm.supabase.co`. Only Supabase's Custom Domain add-on
(~$10/mo, Pro plan) changes that, giving `auth.suitedpoker.com`. If that is ever
done, note that `NEXT_PUBLIC_SUPABASE_URL` is baked into the client bundle at
build time and needs a redeploy, not just an env edit — and the `E2E_*` vars in
`docs/E2E-DATABASE.md` point at the same host.

## Rollback

Branding fields are editable at any time. Publishing can be reverted with "Back
to testing" on the Audience page. A submitted verification can be withdrawn from
the Verification Center. Nothing here touches the OAuth client's redirect URIs,
so Google sign-in keeps working throughout, whatever the branding says.
