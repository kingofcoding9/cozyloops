import { getILoveThisYarnOptions, RavelryError } from '../_lib/ravelry.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': status === 200 ? 'public, max-age=120, s-maxage=300' : 'no-store',
    },
  });
}

export async function onRequestGet({ env }) {
  try {
    const yarnPrice = Number(env.YARN_PRICE);
    if (!Number.isFinite(yarnPrice) || yarnPrice <= 0) {
      console.error('YARN_PRICE is missing or invalid.');
      return json({ error: 'Yarn pricing is not configured.', code: 'yarn_price_invalid' }, 500);
    }
    const options = await getILoveThisYarnOptions(env);
    return json({ ...options, yarnPrice });
  } catch (error) {
    const code = error instanceof RavelryError ? error.code : 'ravelry_failed';
    console.error('Ravelry yarn options failed:', {
      code,
      status: error?.status || null,
      message: error?.message || String(error),
    });

    const message = code === 'ravelry_auth_failed'
      ? 'Ravelry rejected the API credentials. Check RAVELRY_USERNAME and RAVELRY_PASSWORD.'
      : 'Unable to load yarn colors from Ravelry right now.';
    return json({ error: message, code }, 502);
  }
}
