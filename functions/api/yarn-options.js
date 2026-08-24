import { getILoveThisYarnOptions } from '../_lib/ravelry.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=120, s-maxage=300',
    },
  });
}

export async function onRequestGet({ env }) {
  try {
    const yarnPrice = Number(env.YARN_PRICE);
    if (!Number.isFinite(yarnPrice) || yarnPrice <= 0) {
      console.error('YARN_PRICE is missing or invalid.');
      return json({ error: 'Yarn pricing is not configured.' }, 500);
    }
    const options = await getILoveThisYarnOptions(env);
    return json({ ...options, yarnPrice });
  } catch (error) {
    console.error('Ravelry yarn options failed:', error?.message || error);
    return json({ error: 'Unable to load yarn colors from Ravelry right now.' }, 502);
  }
}
