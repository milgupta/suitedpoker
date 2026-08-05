# Runbook — how to drive this build

You are running two Claude Code windows. This file is the loop you repeat.
It is short on purpose. If it grows past two screens, the process is wrong.

---

## The two lanes

| Window | Folder | Branch | Doing |
|---|---|---|---|
| **Main** | `~/Desktop/Apps/suitedpoker` | `main` | 1.2 auth → 1.3 |
| **Engine** | `~/Desktop/Apps/suitedpoker-engine` | `track/engine` | 2.4 → 2.5 → 2.6 → 2.7 |

Main owns everything except the engine lane. Engine owns exactly:

```
src/poker/**
src/content/solutions/**
scripts/import-solutions.ts
tests/unit/poker/**
```

---

## The loop

Every time a window says it's finished a substage:

1. **Read its `✅ Done when` report.** Not the prose — the pass/fail table.
   If it didn't print one, ask for one before saying "next".
2. **Say "next".** Don't re-explain the plan; the plan is in the repo.
3. If it asks a question, answer it or bring it here.

That's it. Everything below is the exceptions.

---

## Landing the engine branch

Do this when the engine chain finishes, or any time you want the work backed
up off the laptop. **Run it from the engine window.**

```bash
# 1. in the engine worktree — pick up whatever main has gained
git fetch origin && git rebase origin/main
npm install          # main may have added deps
npm run verify       # must be green ON THE REBASED BRANCH

# 2. then fold it into main
git -C ~/Desktop/Apps/suitedpoker merge --ff-only track/engine
git -C ~/Desktop/Apps/suitedpoker push
```

**`--ff-only` failing means you skipped step 1.** It is not a problem, it is
the check working. Rebase and try again.

Never merge main *into* the branch. Rebase only.

Do it when the main window is between substages, not mid-write.

---

## Credential queue — the only real blockers

Agents cannot do these. Each one stalls a substage until it exists.

- [x] Supabase project — done, 1.1 applied
- [ ] **Google OAuth** — blocks 1.2, needed now
- [ ] `support@suitedpoker.com` — alias to Gmail, 5 min. Referenced in 3 places
      on the live site and wanted by both Google and Stripe.
- [ ] Stripe account + products + webhook — blocks all of Stage 5
- [ ] A poker-literate reviewer for the 2.4 / 2.8 data — the last single point
      of failure in the whole build

### Google OAuth (do this now)

**console.cloud.google.com**

1. New project `suitedpoker`
2. OAuth consent screen → External. Support email = your Gmail for now.
3. Scopes: `openid`, `userinfo.email`, `userinfo.profile`. **Nothing else** —
   anything sensitive puts you in a multi-week Google review.
4. Credentials → OAuth client ID → Web application
   - JS origins: `https://www.suitedpoker.com`, `https://suitedpoker.com`,
     `http://localhost:3000`
   - Redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`
     (copy it from Supabase, don't type it) and
     `http://127.0.0.1:54321/auth/v1/callback`

**Supabase dashboard**

5. Authentication → Providers → Google → enable, paste ID + secret
6. Authentication → URL Configuration → Site URL `https://www.suitedpoker.com`;
   redirect URLs `https://www.suitedpoker.com/**`, `https://suitedpoker.com/**`,
   `http://localhost:3000/**`
7. **Publish the consent screen** before launch. While it's in Testing only
   manually-added accounts can sign in, capped at 100.

Then tell the main window: *"Google provider is live in Supabase."*

---

## Rules that stop this getting messy

- **Secrets go in `.env.local` and in Vercel's env settings. Never into a chat
  window, never into git.**
- Push `main` at the end of every work session. Unpushed work is unbacked work.
- Add new env vars to Vercel *before* pushing, or the deploy goes red.
- One window, one lane. If an agent says it needs a file outside its lane, that
  is a signal to stop and re-cut the lanes — not to reach across.
