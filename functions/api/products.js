import { getCatalog } from '../_lib/catalog.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=30, s-maxage=60',
    },
  });
}

export async function onRequestGet() {
  try {
    const products = await getCatalog();
    return json(products);
  } catch (error) {
    console.error('Catalog fetch failed:', error);
    return json({ error: 'Unable to load products right now.' }, 502);
  }
}
