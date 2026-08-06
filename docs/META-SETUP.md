# Meta Pixel and Conversions API — setup

What you have to do by hand. The code is done and tested; these are the account
steps it depends on.

## 1. Environment variables

```
NEXT_PUBLIC_META_PIXEL_ID=<your pixel id>
META_CAPI_ACCESS_TOKEN=<system user token>
META_TEST_EVENT_CODE=<only while testing — REMOVE before live spend>
```

`META_TEST_EVENT_CODE` routes every event into Meta's Test Events panel instead
of production reporting. Leaving it set in production means Meta records
nothing, and you will not notice for days.

## 2. Get the access token

Events Manager → your pixel → Settings → Conversions API → Generate access
token. Use a **system user** token, not a personal one: a personal token dies
when that person's password changes or they leave.

## 3. Verify with Test Events

1. Set `META_TEST_EVENT_CODE` from Events Manager → Test Events.
2. Walk the funnel: land with `?fbclid=test&utm_source=meta` → sign up →
   finish onboarding (**Lead**) → view the diagnosis (**ViewContent**) → start
   checkout (**InitiateCheckout**) → complete a test purchase (**Purchase**).
3. Every event should appear. `Purchase` should appear **once**, with both
   "Browser" and "Server" listed against it — that is deduplication working.
   Two separate Purchase rows means the event ids did not match.

## 4. The deduplication contract

| Event | Browser | Server | Shared id from |
|---|---|---|---|
| PageView | ✅ | — | not deduplicated |
| ViewContent | ✅ | ✅ | minted in `trackDeduplicated` |
| Lead | ✅ | ✅ | minted in `trackDeduplicated` |
| InitiateCheckout | ✅ | ✅ | minted in `trackDeduplicated` |
| Purchase | ✅ (/welcome) | ✅ (Stripe webhook) | minted at checkout, carried through Stripe metadata |

Purchase is the one that matters and the one with the longest chain: the paywall
mints the id, stores it in `localStorage`, and sends it to Stripe as
`metadata.metaEventId`. The webhook reads it back; `/welcome` reads it from
`localStorage` and fires the browser half. If `localStorage` is unavailable
(private browsing) only the server half fires, which is correct — one
attributed conversion beats two unattributed ones.

## 5. The cron

`/api/meta/retry` drains the CAPI retry queue. Add to `vercel.json`:

```json
{ "crons": [{ "path": "/api/meta/retry", "schedule": "*/15 * * * *" }] }
```

It needs `CRON_SECRET` set, and fails closed in production without it.

## 6. Event Match Quality — check this 72 hours after first spend

EMQ is computed by Meta over days of live traffic, so it cannot be verified
before launch. What IS verified in `tests/unit/meta.test.ts` is every input:
hashed `em` (SHA-256 of the trimmed, lowercased email, pinned to a hash computed
outside this codebase), plus `fbp` and `fbc` sent verbatim.

**72 hours after your first live spend, open Events Manager → your pixel → the
Purchase event, and confirm Event Match Quality is at least "Good".** If it is
not, the usual causes in order: `META_TEST_EVENT_CODE` still set, the `fbc`
cookie never captured (check `profiles.fbc` is populated), or the email hashed
before normalisation.
