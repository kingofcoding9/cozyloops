import { onRequestPost as createCheckout } from './functions/api/checkout.js';
import { onRequestPost as handleWebhook } from './functions/api/webhook.js';
import { onRequestGet as getProducts } from './functions/api/products.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/products') {
      if (request.method !== 'GET') {
        return json({ error: 'Method not allowed.' }, 405);
      }
      return getProducts({ request, env, ctx });
    }
    if (url.pathname === '/api/checkout') {
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed.' }, 405);
      }
      return createCheckout({ request, env, ctx });
    }

    if (url.pathname === '/api/webhook') {
      if (request.method !== 'POST') {
        return new Response('Method not allowed.', { status: 405 });
      }
      return handleWebhook({ request, env, ctx });
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'Not found.' }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};
