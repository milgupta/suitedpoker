# Reprice — $24.99/$119.99 → $19.99/$73.99

A paste-ready prompt for a browser agent, plus what the new numbers imply.

| | Old | New |
|---|---|---|
| Monthly | $24.99 | **$19.99** |
| Annual | $119.99 | **$73.99** |

Derived automatically by `src/lib/stripe/plans.ts` — do not hand-write these:

- Annual card headline: **$6.17 per month**, "billed yearly"
- Ribbon: **"Save 69%"** (against $239.88 of monthly)
- PostHog `revenue` and Meta `value` follow `amountCents`

**The agent's job is Stripe only.** The code change, the env vars and the
verification are separate steps — see the ordered list in the chat that produced
this file, or `docs/STRIPE-SETUP.md`.

---

## Prompt

> You are adding two new subscription prices in the Stripe dashboard. Do exactly
> this and nothing else.
>
> **Context you need to know:** in Stripe, a price is immutable — you cannot
> edit an existing one. You ADD a new price to the existing product. Do not
> create new products. Do not archive, delete, or deactivate anything.
>
> 1. Go to https://dashboard.stripe.com. **If sign-in, a password, or 2FA is
>    required, stop and hand back to the human — do not enter credentials.**
> 2. Confirm you are in **TEST MODE** (the toggle in the top navigation must
>    read "Test mode"). Everything in steps 3–6 happens in test mode.
> 3. Open **Product catalogue** and find the existing product named
>    **`SuitedPoker Monthly`**. Open it.
> 4. Add a new price to that product:
>    - Amount: **19.99**
>    - Currency: **USD**
>    - Type: **Recurring**
>    - Billing period: **Monthly**
>    - Leave every other field at its default. Do not set a trial, a coupon, tiered
>      pricing, or a lookup key.
>    Save it, then copy the new price id — it starts with `price_`.
> 5. Open the existing product named **`SuitedPoker Annual`**. Add a new price:
>    - Amount: **73.99**
>    - Currency: **USD**
>    - Type: **Recurring**
>    - Billing period: **Yearly**
>    Save it and copy the new price id.
> 6. Report both test-mode price ids, clearly labelled monthly and annual.
> 7. Switch to **LIVE MODE** and repeat steps 3–6 exactly. The ids will be
>    different from the test-mode ones — that is expected and is the whole
>    reason both sets are needed.
> 8. Report all four price ids in this format:
>
>    ```
>    TEST  monthly  price_...
>    TEST  annual   price_...
>    LIVE  monthly  price_...
>    LIVE  annual   price_...
>    ```
>
> **Constraints:**
> - Do NOT archive or deactivate the old $24.99 and $119.99 prices. Existing
>   subscribers are still billed on them, and they must keep working until the
>   new prices are verified.
> - Do NOT modify the products themselves — not the name, description, image,
>   statement descriptor, or metadata.
> - Do NOT touch the customer portal, webhooks, tax settings, or any API keys.
> - Do NOT create a coupon, promotion code, or trial.
> - If a product named `SuitedPoker Monthly` or `SuitedPoker Annual` does not
>   exist, or there is more than one candidate, STOP and report what you see
>   rather than guessing or creating one.
> - If anything fails, paste the exact error and stop. Do not retry with
>   different values.

---

## After the agent reports back

1. Set `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL` in `.env.local` to the
   **TEST** ids, and change `amountCents` in `src/lib/stripe/plans.ts` to
   `1999` and `7399`.
2. `npx playwright test tests/e2e/checkout.spec.ts` and `npm run test:stripe` —
   these complete real test-mode purchases, and are what actually catch a
   price/display mismatch.
3. Set the **LIVE** ids in Vercel, then push. Env before push: a deployment
   picks up both at once, and the reverse order leaves a window where the
   paywall shows $19.99 while Stripe charges $24.99.
4. Load `/paywall` in production, confirm **$19.99**, **$73.99**, **$6.17 per
   month** and **Save 69%**, then run one real card through and refund it.
5. Only once that is confirmed: archive the old prices so nothing new can use
   them. Existing subscriptions are unaffected by archiving.

## Grandfathering

Changing the price id does not touch live subscriptions — existing subscribers
stay on $24.99/$119.99 indefinitely. But `plans.ts` drives every *displayed*
price, so a grandfathered subscriber will see $19.99 in-app and in dunning email
while being charged $24.99. At current volume that is likely nobody; check the
subscriber count before assuming.
