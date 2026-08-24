import { getCatalog } from '../_lib/catalog.js';
import { getILoveThisYarnOptions } from '../_lib/ravelry.js';

const VALID_SIZES = new Set(['XS', 'S', 'M', 'L', 'XL', '2X']);
const VALID_FITS = new Set(['Female', 'Male', 'Standard']);
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

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function getSkeinConfiguration(product, requestedFit) {
  const general = positiveNumber(product['Yarn Skein Count']);
  const female = positiveNumber(product.Female);
  const male = positiveNumber(product.Male);
  const hasFitCounts = female != null || male != null;

  if (hasFitCounts) {
    if (requestedFit === 'Female' && female != null) return { fit: 'Female', skeins: female };
    if (requestedFit === 'Male' && male != null) return { fit: 'Male', skeins: male };
    return null;
  }

  if (general != null && requestedFit === 'Standard') {
    return { fit: 'Standard', skeins: general };
  }
  return null;
}

export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: 'Stripe is not configured on the server.' }, 500);
  }

  const yarnPrice = Number(env.YARN_PRICE);
  if (!Number.isFinite(yarnPrice) || yarnPrice <= 0) {
    return json({ error: 'Yarn pricing is not configured on the server.' }, 500);
  }
  const yarnUnitAmount = Math.round(yarnPrice * 100);

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
    const fit = String(item?.fit || '').trim();
    const quantity = Number(item?.quantity);
    const yarnId = Number(item?.yarnId);
    const colorwayId = String(item?.colorwayId || '').trim();
    const colorwayName = String(item?.colorwayName || '').trim();

    if (!name || name.length > 200 || !VALID_SIZES.has(size) || !VALID_FITS.has(fit) || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_LINE) {
      return json({ error: 'Your cart contains an invalid product, size, fit, or quantity.' }, 400);
    }
    if (yarnId !== 7343 || !colorwayId || !colorwayName || colorwayName.length > 120) {
      return json({ error: 'Your cart contains an invalid yarn or color selection.' }, 400);
    }
    requestedItems.push({ name, size, fit, quantity, yarnId, colorwayId, colorwayName });
  }

  let catalog;
  let ravelryOptions;
  try {
    [catalog, ravelryOptions] = await Promise.all([
      getCatalog(),
      getILoveThisYarnOptions(env),
    ]);
  } catch (error) {
    console.error('Checkout catalog/yarn lookup failed:', error?.message || error);
    return json({ error: 'Unable to verify the cart right now.' }, 502);
  }

  const productsByName = new Map();
  for (const product of catalog) {
    const key = normalizeName(product?.Name);
    if (!key) continue;
    if (productsByName.has(key)) productsByName.set(key, null);
    else productsByName.set(key, product);
  }

  const colorwaysById = new Map(
    (ravelryOptions.colorways || []).map((colorway) => [String(colorway.id), colorway])
  );

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

    const skeinConfig = getSkeinConfiguration(product, requested.fit);
    if (!skeinConfig || !Number.isInteger(skeinConfig.skeins) || skeinConfig.skeins < 1) {
      return json({ error: `Yarn quantity is not configured for ${product.Name} (${requested.fit}).` }, 400);
    }

    const colorway = colorwaysById.get(requested.colorwayId);
    if (!colorway || colorway.name !== requested.colorwayName) {
      return json({ error: `The selected yarn color for ${product.Name} is no longer available.` }, 400);
    }

    verifiedLines.push({
      name: String(product.Name).trim(),
      description: String(product.Description || '').trim(),
      image: String(product['Picture Link'] || '').trim(),
      baseUnitAmount: Math.round(basePrice * 100),
      size: requested.size,
      fit: skeinConfig.fit,
      skeinsPerItem: skeinConfig.skeins,
      quantity: requested.quantity,
      yarnName: 'I Love This Yarn!',
      colorwayId: requested.colorwayId,
      colorwayName: colorway.name,
      yarnImage: String(colorway.image || ravelryOptions?.yarn?.photos?.[0] || ''),
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

  let stripeIndex = 0;
  verifiedLines.forEach((line, cartIndex) => {
    const productPrefix = `line_items[${stripeIndex++}]`;
    params.set(`${productPrefix}[quantity]`, String(line.quantity));
    params.set(`${productPrefix}[price_data][currency]`, currency);
    params.set(`${productPrefix}[price_data][unit_amount]`, String(line.baseUnitAmount));
    params.set(`${productPrefix}[price_data][product_data][name]`, `${line.name} — Size ${line.size}`);

    const productDescription = [line.description, `Fit: ${line.fit}`, `Color: ${line.colorwayName}`]
      .filter(Boolean).join(' • ').slice(0, 500);
    params.set(`${productPrefix}[price_data][product_data][description]`, productDescription);
    const productImage = safeStripeImage(line.image) || `https://placehold.co/400x300/f2e5c8/d9653c?text=${encodeURIComponent(line.name)}`;
    params.set(`${productPrefix}[price_data][product_data][images][0]`, productImage);

    const yarnPrefix = `line_items[${stripeIndex++}]`;
    const totalSkeins = line.skeinsPerItem * line.quantity;
    params.set(`${yarnPrefix}[quantity]`, String(totalSkeins));
    params.set(`${yarnPrefix}[price_data][currency]`, currency);
    params.set(`${yarnPrefix}[price_data][unit_amount]`, String(yarnUnitAmount));
    params.set(`${yarnPrefix}[price_data][product_data][name]`, `${line.yarnName} — ${line.colorwayName}`);
    params.set(`${yarnPrefix}[price_data][product_data][description]`, `Yarn for ${line.name} • ${line.skeinsPerItem} skein(s) per item • ${line.fit} fit`.slice(0, 500));
    const yarnImage = safeStripeImage(line.yarnImage);
    if (yarnImage) params.set(`${yarnPrefix}[price_data][product_data][images][0]`, yarnImage);

    params.set(`metadata[line_${cartIndex + 1}]`, `${line.name} | ${line.size} | ${line.fit} | ${line.skeinsPerItem} skeins | ${line.colorwayName}`.slice(0, 500));
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
