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
