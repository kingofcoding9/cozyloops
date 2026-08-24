const RAVELRY_API = 'https://api.ravelry.com';
const RAVELRY_YARN_PAGE = 'https://www.ravelry.com/yarns/library/hobby-lobby-i-love-this-yarn';
export const I_LOVE_THIS_YARN_ID = 7343;
export const I_LOVE_THIS_YARN_NAME = 'I Love This Yarn!';
export const I_LOVE_THIS_YARN_COMPANY = 'Hobby Lobby';

export class RavelryError extends Error {
  constructor(message, code = 'ravelry_failed', status = null) {
    super(message);
    this.name = 'RavelryError';
    this.code = code;
    this.status = status;
  }
}

function authHeader(env) {
  if (!env.RAVELRY_USERNAME || !env.RAVELRY_PASSWORD) {
    throw new RavelryError('Ravelry credentials are not configured.', 'ravelry_credentials_missing');
  }
  return `Basic ${btoa(`${env.RAVELRY_USERNAME}:${env.RAVELRY_PASSWORD}`)}`;
}

async function ravelryGet(path, env) {
  const response = await fetch(`${RAVELRY_API}${path}`, {
    headers: {
      Authorization: authHeader(env),
      Accept: 'application/json',
    },
    cf: { cacheTtl: 300, cacheEverything: true },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const code = response.status === 401 || response.status === 403
      ? 'ravelry_auth_failed'
      : 'ravelry_api_failed';
    throw new RavelryError(
      `Ravelry API request failed (${response.status})${text ? `: ${text.slice(0, 160)}` : ''}`,
      code,
      response.status,
    );
  }
  return response.json();
}

function imageFrom(value) {
  if (!value || typeof value !== 'object') return null;
  return value.medium2_url || value.medium_url || value.small2_url || value.small_url || value.thumbnail_url || value.square_url || null;
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getPublishedColorways() {
  const response = await fetch(RAVELRY_YARN_PAGE, {
    headers: { Accept: 'text/html' },
    cf: { cacheTtl: 900, cacheEverything: true },
  });
  if (!response.ok) {
    throw new RavelryError(`Ravelry yarn page failed (${response.status}).`, 'ravelry_colorways_failed', response.status);
  }

  const html = await response.text();
  const blockRegex = /<div class="colorway yarn__colorway__preview">([\s\S]*?)<\/div>\s*<\/div>/g;
  const colorways = [];
  let match;
  while ((match = blockRegex.exec(html)) !== null) {
    const block = match[1];
    const nameMatch = block.match(/<div class="yarn__colorway__preview__title">\s*([\s\S]*?)\s*<\/div>/i);
    if (!nameMatch) continue;
    const name = decodeHtml(nameMatch[1].replace(/<[^>]+>/g, ''));
    if (!name) continue;
    const imageMatch = block.match(/<img[^>]+src="([^"]+)"/i);
    const image = imageMatch ? decodeHtml(imageMatch[1]) : null;
    colorways.push({
      // Ravelry's public preview does not expose a stable colorway numeric id,
      // so the normalized colorway name is our stable selection key.
      id: name,
      name,
      image,
    });
  }

  if (colorways.length === 0) {
    throw new RavelryError('No published colorways were found on the Ravelry yarn page.', 'ravelry_colorways_empty');
  }

  const seen = new Set();
  return colorways.filter((colorway) => {
    const key = colorway.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export async function getILoveThisYarnOptions(env) {
  // Ravelry's documented API exposes the yarn detail endpoint, including
  // colorway_count, but not a separate colorway-list endpoint. Use the API
  // to authenticate and lock the exact yarn, then use that yarn's published
  // Ravelry page for its visible colorway names/photos.
  const [detailData, colorways] = await Promise.all([
    ravelryGet(`/yarns/${I_LOVE_THIS_YARN_ID}.json`, env),
    getPublishedColorways(),
  ]);

  const yarn = detailData?.yarn || detailData?.yarns?.[String(I_LOVE_THIS_YARN_ID)] || detailData;
  const actualName = String(yarn?.name || '').trim();
  const company = String(yarn?.yarn_company?.name || '').trim();

  if (Number(yarn?.id) !== I_LOVE_THIS_YARN_ID || actualName !== I_LOVE_THIS_YARN_NAME || company !== I_LOVE_THIS_YARN_COMPANY) {
    throw new RavelryError('Ravelry returned an unexpected yarn for the locked yarn ID.', 'ravelry_wrong_yarn');
  }

  const yarnPhotos = (Array.isArray(yarn?.photos) ? yarn.photos : [])
    .map(imageFrom)
    .filter(Boolean);
  const firstPhoto = imageFrom(yarn?.first_photo);
  if (firstPhoto && !yarnPhotos.includes(firstPhoto)) yarnPhotos.unshift(firstPhoto);

  return {
    yarn: {
      id: I_LOVE_THIS_YARN_ID,
      name: I_LOVE_THIS_YARN_NAME,
      company: I_LOVE_THIS_YARN_COMPANY,
      weight: yarn?.yarn_weight?.name || null,
      photos: yarnPhotos,
      colorwayCount: Number(yarn?.colorway_count) || null,
    },
    colorways,
  };
}
