import { getCatalog } from '../_lib/catalog.js';

const VALID_SIZES = new Set(['XS', 'S', 'M', 'L', 'XL', '2X']);
const SURCHARGE_SIZES = new Set(['L', 'XL', '2X']);
const SIZE_SURCHARGE_CENTS = 500;
const MAX_CART_LINES = 30;
const MAX_QUANTITY_PER_LINE = 20;

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
    if (parsed.hostname === 'example' || parsed.hostname.endsWith('.example')) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: 'Stripe is not configured on the server.' }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  if (!Array.isArray(payload?.items) || payload.items.length === 0 || payload.items.length > MAX_CART_LINES) {
    return json({ error: 'Your cart is empty or contains too many different items.' }, 400);
  }

  const requestedItems = [];
  for (const item of payload.items) {
    const name = String(item?.name || '').trim();
    const size = String(item?.size || '').trim().toUpperCase();
    const quantity = Number(item?.quantity);

    if (!name || name.length > 200 || !VALID_SIZES.has(size) || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_LINE) {
      return json({ error: 'Your cart contains an invalid product, size, or quantity.' }, 400);
    }
    requestedItems.push({ name, size, quantity });
  }

  let catalog;
  try {
    catalog = await getCatalog();
  } catch (error) {
    console.error('Catalog lookup failed:', error);
    return json({ error: 'Unable to verify the cart right now.' }, 502);
  }

  const productsByName = new Map();
  for (const product of catalog) {
    const key = normalizeName(product?.Name);
    if (!key) continue;
    // Duplicate names are unsafe because the browser uses product name as the catalog key.
    if (productsByName.has(key)) productsByName.set(key, null);
    else productsByName.set(key, product);
  }

  const verifiedLines = [];
  for (const requested of requestedItems) {
    const product = productsByName.get(normalizeName(requested.name));
    if (!product) {
      return json({ error: `The product "${requested.name}" is no longer available.` }, 404);
    }

    const basePrice = Number(product.Price);
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      console.error('Catalog product has invalid price:', product.Name);
      return json({ error: 'A product in your cart has an invalid price.' }, 502);
    }

    verifiedLines.push({
      name: String(product.Name).trim(),
      description: String(product.Description || '').trim(),
      image: String(product['Picture Link'] || '').trim(),
      size: requested.size,
      quantity: requested.quantity,
      unitAmount: Math.round(basePrice * 100) + (SURCHARGE_SIZES.has(requested.size) ? SIZE_SURCHARGE_CENTS : 0),
    });
  }

  const currency = String(env.STRIPE_CURRENCY || 'usd').toLowerCase();
  const origin = new URL(request.url).origin;
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${origin}/?checkout=cancelled`);
  params.set('shipping_address_collection[allowed_countries][0]', 'US');
  params.set('metadata[cart_line_count]', String(verifiedLines.length));

  verifiedLines.forEach((line, index) => {
    const prefix = `line_items[${index}]`;
    params.set(`${prefix}[quantity]`, String(line.quantity));
    params.set(`${prefix}[price_data][currency]`, currency);
    params.set(`${prefix}[price_data][unit_amount]`, String(line.unitAmount));
    params.set(`${prefix}[price_data][product_data][name]`, `${line.name} — Size ${line.size}`);

    const descriptionParts = [];
    if (line.description) descriptionParts.push(line.description.slice(0, 420));
    descriptionParts.push(`Selected size: ${line.size}`);
    if (SURCHARGE_SIZES.has(line.size)) descriptionParts.push('Includes $5 size surcharge.');
    params.set(`${prefix}[price_data][product_data][description]`, descriptionParts.join(' • ').slice(0, 500));

    const image = safeStripeImage(line.image) || `https://placehold.co/400x300/f2e5c8/d9653c?text=${encodeURIComponent(line.name)}`;
    params.set(`${prefix}[price_data][product_data][images][0]`, image);
  });

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
    const stripeError = stripeData?.error || {};
    console.error('Stripe Checkout error:', {
      status: stripeResponse.status,
      type: stripeError.type,
      code: stripeError.code,
      message: stripeError.message,
    });

    if (stripeResponse.status === 401 || stripeResponse.status === 403) {
      return json({ error: 'Stripe rejected the server API key. Check STRIPE_SECRET_KEY in Cloudflare.', code: 'stripe_auth_failed' }, 502);
    }

    return json({ error: 'Stripe rejected the checkout configuration.', code: stripeError.code || stripeError.type || 'stripe_checkout_failed' }, 502);
  }

  if (!stripeData.url) {
    console.error('Stripe Checkout response did not contain a redirect URL.', stripeData.id);
    return json({ error: 'Stripe did not return a checkout URL.', code: 'stripe_missing_url' }, 502);
  }

  return json({ url: stripeData.url });
}
