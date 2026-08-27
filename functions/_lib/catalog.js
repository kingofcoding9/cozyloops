function catalogUrl(env) {
  const value = String(env?.APPS_SHEET_URL || '').trim();
  if (!value) throw new Error('APPS_SHEET_URL is not configured');
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('APPS_SHEET_URL is invalid'); }
  if (parsed.protocol !== 'https:') throw new Error('APPS_SHEET_URL must use HTTPS');
  return parsed.href;
}

export async function getCatalog(env) {
  const response = await fetch(catalogUrl(env), {
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

  return products;
}

export async function getTrustedProduct(productName, env) {
  const products = await getCatalog(env);
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
