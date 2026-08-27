import { getCatalog } from '../_lib/catalog.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function normalizeSharedImageUrl(value) {
  const url = new URL(String(value || '').trim());
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported image URL');

  const host = url.hostname.toLowerCase();

  // Dropbox share pages return HTML. raw=1 makes Dropbox serve the actual file.
  if (host === 'www.dropbox.com' || host === 'dropbox.com') {
    url.searchParams.delete('dl');
    url.searchParams.set('raw', '1');
    return url.href;
  }

  // Google Drive share links also return an HTML viewer. Convert common forms
  // to the file-content endpoint so the storefront receives image bytes.
  if (host === 'drive.google.com') {
    const pathMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    const id = pathMatch?.[1] || url.searchParams.get('id');
    if (id) return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`;
  }

  return url.href;
}

function safeImageContentType(value) {
  const type = String(value || '').split(';', 1)[0].trim().toLowerCase();
  return /^image\/(?:jpeg|png|webp|gif|avif|svg\+xml)$/.test(type) ? type : null;
}

export async function onRequestGet({ request, env }) {
  const requestedName = new URL(request.url).searchParams.get('product')?.trim();
  if (!requestedName || requestedName.length > 200) return json({ error: 'Missing product.' }, 400);

  try {
    const products = await getCatalog(env);
    const wanted = requestedName.toLowerCase();
    const matches = products.filter((product) => String(product?.Name || '').trim().toLowerCase() === wanted);
    if (matches.length !== 1) return json({ error: 'Product image not found.' }, 404);

    const source = String(matches[0]?.['Picture Link'] || matches[0]?.PictureLink || matches[0]?.Image || '').trim();
    if (!source) return json({ error: 'Product image not found.' }, 404);
    const imageUrl = normalizeSharedImageUrl(source);

    const upstream = await fetch(imageUrl, {
      redirect: 'follow',
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.1',
        'User-Agent': 'Cozy-Loops-Storefront/1.0',
      },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });

    if (!upstream.ok) {
      console.error('Product image upstream failed:', upstream.status, new URL(imageUrl).hostname);
      return json({ error: 'Unable to load product image.' }, 502);
    }

    const contentType = safeImageContentType(upstream.headers.get('content-type'));
    if (!contentType) {
      console.error('Product image URL returned non-image content:', upstream.headers.get('content-type'));
      return json({ error: 'The shared link did not return an image.' }, 502);
    }

    return new Response(upstream.body, {
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=3600, s-maxage=86400',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Product image proxy failed:', error?.message || error);
    return json({ error: 'Unable to load product image.' }, 502);
  }
}
