# Stripe + Cloudflare Worker setup

This project deploys as a Cloudflare **Worker with Static Assets**. The Worker handles `/api/*`; `public/index.html` and `public/logo.png` are served as static assets.

The catalog remains the existing Google Sheet. Checkout re-fetches the trusted catalog server-side and creates Stripe Checkout line items dynamically, so Stripe Products do not need to be created manually and browser-supplied prices are never trusted.

## Deploy

From the repository root:

```bash
npx wrangler deploy
```

If this repository is connected to Cloudflare Git deployments, set the deploy command to `npx wrangler deploy`. The Worker entry point is `worker.js` and the static asset directory is `public`.

## Runtime secrets

After the Worker deployment exists, open **Cloudflare → Workers & Pages → cozy-loops → Settings → Variables and Secrets** and add encrypted secrets:

- `STRIPE_SECRET_KEY` — Stripe secret API key (`sk_test_...` while testing).
- `STRIPE_WEBHOOK_SECRET` — Stripe endpoint signing secret (`whsec_...`).
- `RAVELRY_USERNAME` — Ravelry API username.
- `RAVELRY_PASSWORD` — Ravelry API password.
- `YARN_PRICE` — current price per skein of I Love This Yarn! (for example `4.99`).

`STRIPE_CURRENCY=usd` is already a non-secret Worker variable in `wrangler.jsonc`.

For local development, copy `.dev.vars.example` to `.dev.vars` and put test values there. `.dev.vars` is ignored by Git.

## Stripe webhook

Once deployed, create a Stripe webhook endpoint at:

`https://YOUR-DOMAIN/api/webhook`

Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`

Copy that endpoint's `whsec_...` signing secret into Cloudflare as `STRIPE_WEBHOOK_SECRET`.

## Verification

1. Deploy with a Stripe test secret key.
2. Open **Shop** and click **Buy Now**.
3. Confirm Stripe Checkout shows the same item and price as the trusted Google Sheet.
4. Complete a Stripe test payment.
5. Confirm Stripe shows a successful `checkout.session.completed` webhook delivery.
6. Confirm the event appears in Cloudflare Worker logs.

The webhook currently verifies and logs completed orders. Persistent fulfillment/notifications can be added after choosing where orders should be stored.
