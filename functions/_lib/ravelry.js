const RAVELRY_API = 'https://api.ravelry.com';
export const I_LOVE_THIS_YARN_ID = 7343;
export const I_LOVE_THIS_YARN_NAME = 'I Love This Yarn!';
export const I_LOVE_THIS_YARN_COMPANY = 'Hobby Lobby';

function authHeader(env) {
  if (!env.RAVELRY_USERNAME || !env.RAVELRY_PASSWORD) {
    throw new Error('Ravelry credentials are not configured.');
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
    throw new Error(`Ravelry request failed (${response.status})${text ? `: ${text.slice(0, 180)}` : ''}`);
  }
  return response.json();
}

function imageFrom(value) {
  if (!value || typeof value !== 'object') return null;
  return value.medium2_url || value.medium_url || value.small2_url || value.small_url || value.thumbnail_url || value.square_url || null;
}

function normalizeColorway(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.id ?? raw.colorway_id ?? null;
  const name = String(raw.name ?? raw.colorway ?? raw.colorway_name ?? '').trim();
  if (!name) return null;

  const photo = raw.first_photo || raw.photo || raw.photos?.[0] || null;
  const image = imageFrom(photo) || raw.photo_url || raw.image_url || raw.small_photo_url || null;

  return {
    id: id == null ? name : String(id),
    name,
    image: image || null,
  };
}

export async function getILoveThisYarnOptions(env) {
  const [detailData, colorwayData] = await Promise.all([
    ravelryGet(`/yarns/${I_LOVE_THIS_YARN_ID}.json`, env),
    ravelryGet(`/yarns/colorways.json?yarn_id=${I_LOVE_THIS_YARN_ID}`, env),
  ]);

  const yarn = detailData?.yarn || detailData?.yarns?.[String(I_LOVE_THIS_YARN_ID)] || detailData;
  const actualName = String(yarn?.name || '').trim();
  const company = String(yarn?.yarn_company?.name || '').trim();

  // Hard safety check: never expose a related but different Ravelry yarn line.
  if (actualName !== I_LOVE_THIS_YARN_NAME || company !== I_LOVE_THIS_YARN_COMPANY) {
    throw new Error('Ravelry returned an unexpected yarn for the locked yarn ID.');
  }

  const rawColorways = colorwayData?.colorways || colorwayData?.yarn_colorways || colorwayData?.results || [];
  const colorways = Array.isArray(rawColorways)
    ? rawColorways.map(normalizeColorway).filter(Boolean)
    : Object.values(rawColorways || {}).map(normalizeColorway).filter(Boolean);

  const seen = new Set();
  const uniqueColorways = colorways.filter((colorway) => {
    const key = colorway.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

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
    },
    colorways: uniqueColorways,
  };
}
