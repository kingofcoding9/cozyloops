import { getILoveThisYarnOptions } from '../_lib/ravelry.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function safeImageContentType(value) {
  const type = String(value || '').split(';', 1)[0].trim().toLowerCase();
  return /^image\/(?:jpeg|png|webp|gif|avif)$/.test(type) ? type : null;
}

export async function onRequestGet({ request, env }) {
  const requestedId = new URL(request.url).searchParams.get('colorway')?.trim();
  if (!requestedId || requestedId.length > 160) return json({ error: 'Missing yarn colorway.' }, 400);

  try {
    const options = await getILoveThisYarnOptions(env);
    const colorway = options.colorways.find((entry) => String(entry.id) === requestedId);
    if (!colorway?.image) return json({ error: 'Yarn color image not found.' }, 404);

    const upstream = await fetch(colorway.image, {
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    if (!upstream.ok) return json({ error: 'Unable to load yarn color image.' }, 502);
    const contentType = safeImageContentType(upstream.headers.get('content-type'));
    if (!contentType) return json({ error: 'Unexpected yarn image format.' }, 502);

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=86400, s-maxage=604800',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Yarn image proxy failed:', error?.message || error);
    return json({ error: 'Unable to load yarn color image.' }, 502);
  }
}
