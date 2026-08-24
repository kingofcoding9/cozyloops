export const CATALOG_URL = 'https://script.google.com/macros/s/AKfycbzIO6Cwz-cxCDBpFMPrD3r6yTSDIU9W80jPxN6Fa0FeeMWWg8fZ2blLhPiAyKJNwQ4r4g/exec';

export async function getTrustedProduct(productName) {
  const response = await fetch(CATALOG_URL, {
    headers: { 'Accept': 'application/json' },
    cf: { cacheTtl: 60, cacheEverything: true },
  });

  if (!response.ok) {
    throw new Error(`Catalog request failed with ${response.status}`);
  }

  const products = await response.json();
  if (!Array.isArray(products)) {
    throw new Error('Catalog response was not an array');
  }

  const wanted = String(productName || '').trim().toLowerCase();
  const matches = products.filter((product) =>
    String(product?.Name || '').trim().toLowerCase() === wanted
  );

  // Names are the catalog key for now. Refuse ambiguous rows instead of
  // charging for the wrong item if a duplicate name is added to the sheet.
  if (matches.length !== 1) return null;

  const product = matches[0];
  const price = Number(product.Price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Catalog product has an invalid price');
  }

  return {
    name: String(product.Name).trim(),
    description: String(product.Description || '').trim(),
    image: String(product['Picture Link'] || '').trim(),
    price,
  };
}
