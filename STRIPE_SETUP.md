# Stripe + Cloudflare Pages setup

This project uses Cloudflare Pages Functions and Stripe-hosted Checkout.
Products remain in the existing Google Sheet; Stripe Products do not need to be created manually.
The server re-fetches the catalog and trusts the sheet price, not a price sent by the browser.

## Cloudflare Pages secrets

In the Cloudflare dashboard for this Pages project, add these under **Settings → Variables and Secrets** for Production (and Preview if desired):

- `STRIPE_SECRET_KEY` — Stripe secret API key, beginning with `sk_test_` while testing.
- `STRIPE_WEBHOOK_SECRET` — webhook endpoint signing secret, beginning with `whsec_`.
- `STRIPE_CURRENCY` — optional plain-text variable; defaults to `usd`.

Do not put either Stripe secret into `index.html`.

## Stripe webhook

After the Pages deployment has a public hostname, create a Stripe webhook endpoint pointing to:

`https://YOUR-PAGES-DOMAIN/api/webhook`

Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`

Copy the webhook endpoint's signing secret into Cloudflare as `STRIPE_WEBHOOK_SECRET`.

## Test flow

1. Use Stripe test-mode keys.
2. Deploy the project to Cloudflare Pages.
3. Open Shop and click **Buy Now** on an item.
4. Confirm Stripe Checkout shows the same name and price as the trusted sheet.
5. Complete a Stripe test payment.
6. Confirm the `checkout.session.completed` event succeeds in Stripe's webhook delivery log.
7. Confirm the event appears in the Cloudflare Pages Function logs.

The current webhook verifies and logs completed orders. Add persistent fulfillment/notifications in `functions/api/webhook.js` once an order destination (email, database, Google Sheet, etc.) is selected.
