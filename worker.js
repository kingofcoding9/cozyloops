import indexHtml from './public/index.html';
import logoBytes from './public/logo.png';
import logoEmailBytes from './public/logo-email.png';
import { onRequestPost as createCheckout } from './functions/api/checkout.js';
import { onRequestPost as handleWebhook } from './functions/api/webhook.js';
import { onRequestGet as getProducts } from './functions/api/products.js';
import { onRequestGet as getYarnOptions } from './functions/api/yarn-options.js';
import { onRequestPost as submitCustomRequest } from './functions/api/custom-request.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/yarn-options') {
      if (request.method !== 'GET') {
        return json({ error: 'Method not allowed.' }, 405);
      }
      return getYarnOptions({ request, env, ctx });
    }

    if (url.pathname === '/api/products') {
      if (request.method !== 'GET') {
        return json({ error: 'Method not allowed.' }, 405);
      }
      return getProducts({ request, env, ctx });
    }
    if (url.pathname === '/api/custom-request') {
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed.' }, 405);
      }
      return submitCustomRequest({ request, env, ctx });
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

    const normalizedPath = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;

    if ((request.method === 'GET' || request.method === 'HEAD') && normalizedPath === '/logo.png') {
      return new Response(request.method === 'HEAD' ? null : logoBytes, {
        headers: {
          'content-type': 'image/png',
          'cache-control': 'public, max-age=86400',
        },
      });
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && normalizedPath === '/logo-email.png') {
      return new Response(request.method === 'HEAD' ? null : logoEmailBytes, {
        headers: {
          'content-type': 'image/png',
          'cache-control': 'public, max-age=86400',
        },
      });
    }

    // Clean, shareable storefront routes all render the bundled SPA entry point.
    const storefrontRoutes = new Set(['/', '/shop', '/custom', '/contact', '/about']);
    if (storefrontRoutes.has(normalizedPath) && (request.method === 'GET' || request.method === 'HEAD')) {
      return new Response(request.method === 'HEAD' ? null : indexHtml, {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-cache',
        },
      });
    }

    return json({ error: 'Not found.' }, 404);
  },
};
