import { verifyStripeWebhook } from '../_lib/stripe-webhook.js';

export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return new Response('Webhook secret is not configured.', { status: 500 });
  }

  // Stripe signature verification requires the exact, unmodified request body.
  const rawBody = await request.text();
  const signature = request.headers.get('Stripe-Signature');

  const valid = await verifyStripeWebhook(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    return new Response('Invalid Stripe signature.', { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON.', { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      console.log('Paid Cozy Loops order', {
        eventId: event.id,
        sessionId: session.id,
        productName: session.metadata?.product_name,
        amountTotal: session.amount_total,
        currency: session.currency,
        customerEmail: session.customer_details?.email,
      });
      // This is the fulfillment hook. Persist/notify the order here once you
      // decide where completed orders should be stored.
      break;
    }
    case 'checkout.session.async_payment_succeeded':
      console.log('Delayed payment succeeded:', event.data.object.id);
      break;
    case 'checkout.session.async_payment_failed':
      console.warn('Delayed payment failed:', event.data.object.id);
      break;
    default:
      // Acknowledge event types we don't currently use so Stripe won't retry them.
      break;
  }

  return new Response('ok', { status: 200 });
}
