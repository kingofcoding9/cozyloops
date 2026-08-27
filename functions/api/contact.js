function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function appsSheetUrl(env) {
  const value = String(env?.APPS_SHEET_URL || '').trim();
  if (!value) throw new Error('APPS_SHEET_URL is not configured');
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') throw new Error('APPS_SHEET_URL must use HTTPS');
  return parsed.href;
}

export async function onRequestPost({ request, env }) {
  try {
    const incoming = await request.formData();
    const outgoing = new URLSearchParams();
    for (const [key, value] of incoming.entries()) {
      if (typeof value === 'string') outgoing.append(key, value);
    }

    const response = await fetch(appsSheetUrl(env), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: outgoing.toString(),
      redirect: 'follow',
    });

    if (!response.ok) {
      console.error('Contact form Apps Script response:', response.status);
      return json({ error: 'Unable to send your message right now.' }, 502);
    }

    return json({ ok: true });
  } catch (error) {
    console.error('Contact form submission failed:', error?.message || error);
    return json({ error: 'Unable to send your message right now.' }, 502);
  }
}
