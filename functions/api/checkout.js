import { getTrustedProduct } from '../_lib/catalog.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function safeStripeImage(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    // The current sheet contains an example placeholder URL; don't send it to Stripe.
    if (parsed.hostname === 'example' || parsed.hostname.endsWith('.example')) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: 'Stripe is not configured on the server.' }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const productName = String(payload?.productName || '').trim();
  if (!productName || productName.length > 200) {
    return json({ error: 'A valid product name is required.' }, 400);
  }

  let product;
  try {
    product = await getTrustedProduct(productName);
  } catch (error) {
    console.error('Catalog lookup failed:', error);
    return json({ error: 'Unable to verify this product right now.' }, 502);
  }

  if (!product) {
    return json({ error: 'That product is no longer available.' }, 404);
  }

  // Never accept a price from the browser. Convert the trusted sheet price to cents.
  const unitAmount = Math.round(product.price * 100);
  const currency = String(env.STRIPE_CURRENCY || 'usd').toLowerCase();
  const origin = new URL(request.url).origin;

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${origin}/?checkout=cancelled`);
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', currency);
  params.set('line_items[0][price_data][unit_amount]', String(unitAmount));
  params.set('line_items[0][price_data][product_data][name]', product.name);
  params.set('metadata[product_name]', product.name);

  if (product.description) {
    params.set('line_items[0][price_data][product_data][description]', product.description.slice(0, 500));
  }

  const image = safeStripeImage(product.image);
  if (image) {
    params.set('line_items[0][price_data][product_data][images][0]', image);
  }

  // These are physical goods, so collect a US shipping address in Checkout.
  params.set('shipping_address_collection[allowed_countries][0]', 'US');

  let stripeResponse;
  try {
    stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
  } catch (error) {
    console.error('Stripe request failed:', error);
    return json({ error: 'Unable to reach Stripe right now.' }, 502);
  }

  const stripeData = await stripeResponse.json();
  if (!stripeResponse.ok) {
    console.error('Stripe Checkout error:', stripeData?.error?.message || stripeData);
    return json({ error: 'Unable to start checkout.' }, 502);
  }

  return json({ url: stripeData.url });
}
