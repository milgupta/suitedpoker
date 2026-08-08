# Resend and email deliverability — setup

The code is done. These are the DNS records, and they are the difference
between "sent" and "delivered".

## 1. Add and verify the domain

Resend → Domains → Add Domain → `suitedpoker.com`.

Resend generates records specific to your account. **Copy the exact values it
shows you** — the selectors below are placeholders for shape, not values to
paste.

| Type | Name | Value | Notes |
|---|---|---|---|
| TXT | `send.suitedpoker.com` | `v=spf1 include:amazonses.com ~all` | SPF for the sending subdomain |
| TXT | `resend._domainkey.suitedpoker.com` | *(the long key Resend shows)* | DKIM |
| MX | `send.suitedpoker.com` | `feedback-smtp.us-east-1.amazonses.com` (priority 10) | bounce handling |
| TXT | `_dmarc.suitedpoker.com` | `v=DMARC1; p=none; rua=mailto:dmarc@suitedpoker.com` | see below |

### DMARC, in stages

Start at `p=none`. It changes nothing about delivery and starts the reports
flowing. After two weeks of clean reports move to `p=quarantine`, and only then
to `p=reject`.

Going straight to `p=reject` is the classic way to silently drop every
transactional email the moment one alignment detail is wrong — and the emails
you would lose are password resets and dunning.

## 2. Environment

```
RESEND_API_KEY=re_...
NEXT_PUBLIC_SITE_URL=https://suitedpoker.com
```

`NEXT_PUBLIC_SITE_URL` is not optional for email. Every link is built from it,
and a test asserts no email contains a relative or `localhost` URL — but only
the env var stops a staging deploy emailing real customers links to staging.

## 2b. The two auth emails Supabase sends

**Signup confirmation and password reset do not go through Resend.** Supabase
Auth sends them, because Supabase mints the one-time token in the link. So the
first email a new user ever receives is Supabase's stock template — unbranded,
on Supabase's shared IPs, rate-limited to a few an hour.

Both are branded and in the repo. Getting them out:

```bash
npm run emails:supabase
```

That writes `docs/supabase-emails/`. Paste each file into
**Supabase → Authentication → Emails → Templates** and set the subject the
script prints beside it:

| File | Supabase template | Subject |
|---|---|---|
| `confirm-signup.html` | Confirm signup | Confirm your email |
| `reset-password.html` | Reset password | Reset your SuitedPoker password |

The link URL is left as Supabase's `{{ .ConfirmationURL }}`, which it
substitutes server-side. The script fails rather than writing a file where that
variable did not survive rendering — a template that looks right in the
dashboard and mails everyone a dead link is the failure worth catching.

Then point **Auth → SMTP** at Resend with the same from-address below. Until you
do, these two emails keep Supabase's sending limits, which is what makes the
signup e2e skip.

🔴 **This is a copy that WILL drift.** Nothing in the build can reach into the
Supabase dashboard, so `npm run verify` cannot tell you the pasted version is
stale. Re-run the script and paste again after touching anything in
`src/emails/`.

## 3. From-address convention

| Purpose | Address |
|---|---|
| All transactional | `SuitedPoker <hello@suitedpoker.com>` |
| Reply-to | `help@suitedpoker.com` |

**No `no-reply@`.** Replies to a transactional email are usually the customer
trying to solve the problem the email is about; sending those into a void turns
a recoverable subscription into a chargeback. `help@` must be a real inbox a
person reads.

## 4. The dunning cron

`/api/email/dunning` runs the schedule. Add to `vercel.json`:

```json
{ "crons": [{ "path": "/api/email/dunning", "schedule": "0 15 * * *" }] }
```

15:00 UTC is late morning in the US and early evening in Europe — a card gets
fixed when someone is awake and near their wallet.

It needs `CRON_SECRET`, and fails closed in production without it.

## 5. Before the first real send

- [ ] Domain verified in Resend (all records green)
- [ ] DMARC at `p=none`, reports arriving
- [ ] `help@suitedpoker.com` is a real inbox someone reads
- [ ] Send one of each to a personal Gmail AND an iCloud address, and open both
      in dark mode. The design is dark; a client that inverts it is the failure
      mode to look for.
- [ ] Check the plain-text part renders — in Gmail, "Show original".
