# Stripe setup

The click-by-click list. Do all of it in **Test mode** first — the toggle is top
right in the dashboard, and every id below is different between the two modes.
Test keys start `sk_test_` / `pk_test_`; live keys start `sk_live_` / `pk_live_`.

Nothing here is done by the app. Products, prices, the portal and the webhook
endpoint are dashboard state, and the app only reads their ids.

---

## 1. Products and prices

**Product catalogue → Add product.**

| Field | Value |
|---|---|
| Name | SuitedPoker Monthly |
| Price | `24.99` USD |
| Billing period | Monthly |
| Type | Recurring |

Repeat:

| Field | Value |
|---|---|
| Name | SuitedPoker Annual |
| Price | `119.99` USD |
| Billing period | Yearly |
| Type | Recurring |

Two products with one price each, or one product with two prices — both work.
The app only ever reads the two **price** ids (`price_…`, not `prod_…`).

Copy each price id from the product page:

```
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_ANNUAL=price_...
```

> These are **server-only**. Do not prefix them `NEXT_PUBLIC_`. The client sends
> `plan: "monthly" | "annual"` and the server chooses the price — a client that
> can name its own price can name a cheap one.

## 2. API keys

**Developers → API keys.**

```
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

The publishable key is safe in the browser. The secret key must never be
prefixed `NEXT_PUBLIC_`.

## 3. Customer portal

**Settings → Billing → Customer portal.**

- **Cancellation** — on. Choose *at end of billing period*, not immediately: a
  user who cancels on day 2 keeps what they paid for, and an immediate cutoff is
  a refund request.
- **Payment methods** — allow customers to update.
- **Invoice history** — on.
- **Update subscriptions / switch plans** — **OFF**.

  That last one is deliberate. The monthly → yearly upgrade is `/api/stripe/switch-plan`,
  because 7.5 uses it as a save offer and we need its conversion rate. Enabled in
  the portal, the same change happens somewhere we cannot measure and cannot
  restrict to upgrades only.

- **Business information** — link the Terms and Privacy pages. Stripe shows
  these in the portal and at checkout.

## 4. Webhook endpoint

**Developers → Webhooks → Add endpoint.**

Endpoint URL:

```
https://suitedpoker.com/api/stripe/webhook
```

Events to send:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

Then reveal the signing secret and copy it:

```
STRIPE_WEBHOOK_SECRET=whsec_...
```

For local development the endpoint above is unreachable, so forward instead:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

That prints its **own** `whsec_…`, different from the dashboard one. Use the CLI
secret in `.env.local` while developing and the dashboard secret in production.

## 5. Test cards

| Card | Outcome |
|---|---|
| `4242 4242 4242 4242` | Succeeds |
| `4000 0000 0000 0002` | Declined |
| `4000 0025 0000 3155` | Requires 3D Secure authentication |

Any future expiry, any CVC, any postcode.

---

## Going live

1. Flip the dashboard to Live mode.
2. Recreate both products and prices — **ids differ between modes**.
3. Recreate the webhook endpoint and copy the live signing secret.
4. Reconfigure the portal; its settings are also per-mode.
5. Swap all five env vars in Vercel.
6. Complete one real purchase and refund it.

The single most common mistake is shipping live keys with test price ids. The
checkout call fails with `No such price`, which reads like a bug in the app.
