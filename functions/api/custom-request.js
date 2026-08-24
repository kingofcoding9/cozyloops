import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const RECIPIENT_EMAIL = 'cochrankayce99@gmail.com';
const MAX_BODY_BYTES = 64 * 1024;

const COLORS = {
  cream: rgb(0.973, 0.941, 0.855),
  warm: rgb(0.851, 0.396, 0.235),
  teal: rgb(0.302, 0.522, 0.533),
  brown: rgb(0.255, 0.176, 0.125),
  muted: rgb(0.43, 0.36, 0.29),
  line: rgb(0.86, 0.80, 0.69),
  white: rgb(1, 1, 1),
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function clean(value, max = 250) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanMultiline(value, max = 3000) {
  return String(value ?? '').replace(/\r/g, '').trim().slice(0, max);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizePayload(raw) {
  return {
    name: clean(raw.name, 100),
    email: clean(raw.email, 180).toLowerCase(),
    phone: clean(raw.phone, 40),
    preferredContact: clean(raw.preferredContact, 30),
    itemType: clean(raw.itemType, 100),
    recipient: clean(raw.recipient, 80),
    size: clean(raw.size, 80),
    fit: clean(raw.fit, 40),
    colors: clean(raw.colors, 250),
    budget: clean(raw.budget, 80),
    neededBy: clean(raw.neededBy, 40),
    inspirationUrl: clean(raw.inspirationUrl, 500),
    additionalUrl: clean(raw.additionalUrl, 500),
    description: cleanMultiline(raw.description, 3500),
    notes: cleanMultiline(raw.notes, 1800),
    consent: raw.consent === true || raw.consent === 'true' || raw.consent === 'on',
    website: clean(raw.website, 200), // honeypot
  };
}

function validate(data) {
  const errors = [];
  if (data.website) return ['Spam check failed.'];
  if (data.name.length < 2) errors.push('Please enter your name.');
  if (!isEmail(data.email)) errors.push('Please enter a valid email address.');
  if (!data.itemType) errors.push('Please choose what you would like made.');
  if (!data.size) errors.push('Please provide a size or measurements.');
  if (!data.colors) errors.push('Please describe your preferred colors.');
  if (data.description.length < 20) errors.push('Please provide a little more detail about your custom request.');
  if (!validUrl(data.inspirationUrl) || !validUrl(data.additionalUrl)) errors.push('Reference links must begin with http:// or https://.');
  if (!data.consent) errors.push('Please confirm that Cozy Loops may contact you about this request.');
  return errors;
}

function requestId() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  const random = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `CL-${date}-${random}`;
}

function wrapText(text, font, size, maxWidth) {
  const paragraphs = String(text || '—').split(/\n+/);
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const trial = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(trial, size) <= maxWidth || !line) {
        line = trial;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

async function buildPdf(data, id, submittedAt, logoBytes) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  if (logoBytes?.length) {
    try { logo = await pdf.embedPng(logoBytes); } catch { /* decorative only */ }
  }

  const PAGE_W = 612;
  const PAGE_H = 792;
  const MARGIN = 46;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  let page;
  let y;

  const newPage = (continuation = false) => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: COLORS.cream });
    page.drawRectangle({ x: 0, y: PAGE_H - 14, width: PAGE_W, height: 14, color: COLORS.warm });
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 8, color: COLORS.teal });
    if (continuation) {
      page.drawText('COZY LOOPS  •  CUSTOM REQUEST', { x: MARGIN, y: PAGE_H - 42, size: 9, font: bold, color: COLORS.muted });
      y = PAGE_H - 70;
    } else {
      if (logo) {
        const scale = Math.min(94 / logo.width, 58 / logo.height);
        page.drawImage(logo, { x: MARGIN, y: PAGE_H - 92, width: logo.width * scale, height: logo.height * scale });
      }
      page.drawText('CUSTOM ORDER REQUEST', { x: logo ? 166 : MARGIN, y: PAGE_H - 58, size: 19, font: bold, color: COLORS.brown });
      page.drawText('A detailed request for a handcrafted Cozy Loops piece', { x: logo ? 166 : MARGIN, y: PAGE_H - 76, size: 9.5, font: regular, color: COLORS.muted });
      y = PAGE_H - 119;
    }
  };

  const ensure = (height = 70) => {
    if (y - height < 54) newPage(true);
  };

  const sectionTitle = (title) => {
    ensure(40);
    page.drawRectangle({ x: MARGIN, y: y - 21, width: CONTENT_W, height: 25, color: COLORS.teal });
    page.drawText(title.toUpperCase(), { x: MARGIN + 10, y: y - 14, size: 10, font: bold, color: COLORS.white });
    y -= 34;
  };

  const field = (label, value, options = {}) => {
    const maxWidth = options.width || CONTENT_W;
    const labelSize = 8.5;
    const valueSize = 10.5;
    const lines = wrapText(value || '—', regular, valueSize, maxWidth - 12);
    const height = 22 + Math.max(1, lines.length) * 13;
    ensure(height + 6);
    page.drawText(label.toUpperCase(), { x: MARGIN + (options.x || 0), y, size: labelSize, font: bold, color: COLORS.warm });
    let lineY = y - 15;
    for (const line of lines) {
      page.drawText(line || ' ', { x: MARGIN + (options.x || 0), y: lineY, size: valueSize, font: regular, color: COLORS.brown });
      lineY -= 13;
    }
    page.drawLine({
      start: { x: MARGIN + (options.x || 0), y: lineY + 4 },
      end: { x: MARGIN + (options.x || 0) + maxWidth, y: lineY + 4 },
      thickness: 0.5,
      color: COLORS.line,
    });
    y = lineY - 8;
  };

  const twoFields = (a, b) => {
    const gap = 18;
    const col = (CONTENT_W - gap) / 2;
    ensure(60);
    const startY = y;
    const drawCol = (entry, x) => {
      page.drawText(entry[0].toUpperCase(), { x, y: startY, size: 8.5, font: bold, color: COLORS.warm });
      const lines = wrapText(entry[1] || '—', regular, 10.5, col - 10).slice(0, 3);
      let ly = startY - 15;
      for (const line of lines) { page.drawText(line || ' ', { x, y: ly, size: 10.5, font: regular, color: COLORS.brown }); ly -= 13; }
      page.drawLine({ start: { x, y: startY - 51 }, end: { x: x + col, y: startY - 51 }, thickness: 0.5, color: COLORS.line });
    };
    drawCol(a, MARGIN);
    drawCol(b, MARGIN + col + gap);
    y -= 65;
  };

  newPage(false);

  page.drawRectangle({ x: MARGIN, y: y - 42, width: CONTENT_W, height: 48, color: COLORS.white, borderColor: COLORS.line, borderWidth: 0.8 });
  page.drawText(`REQUEST  ${id}`, { x: MARGIN + 12, y: y - 13, size: 10, font: bold, color: COLORS.warm });
  page.drawText(`Submitted ${submittedAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' })} CT`, { x: MARGIN + 12, y: y - 29, size: 9.5, font: regular, color: COLORS.muted });
  y -= 61;

  sectionTitle('Customer');
  twoFields(['Name', data.name], ['Email', data.email]);
  twoFields(['Phone', data.phone || 'Not provided'], ['Preferred contact', data.preferredContact || 'Email']);

  sectionTitle('Project');
  twoFields(['Item', data.itemType], ['Made for', data.recipient || 'Not specified']);
  twoFields(['Size / measurements', data.size], ['Fit / style', data.fit || 'Not specified']);
  field('Color palette', data.colors);
  twoFields(['Budget', data.budget || 'Open to quote'], ['Needed by', data.neededBy || 'No specific date']);

  sectionTitle('Design brief');
  field('What would you like made?', data.description);
  if (data.notes) field('Additional notes', data.notes);

  if (data.inspirationUrl || data.additionalUrl) {
    sectionTitle('References');
    if (data.inspirationUrl) field('Primary inspiration link', data.inspirationUrl);
    if (data.additionalUrl) field('Additional reference link', data.additionalUrl);
  }

  ensure(54);
  page.drawText('This document is a request for a quote and design discussion; it is not a confirmed order or final price.', {
    x: MARGIN, y: 35, size: 7.5, font: regular, color: COLORS.muted,
  });

  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    p.drawText(`Cozy Loops • ${id} • Page ${index + 1} of ${pages.length}`, {
      x: MARGIN, y: 20, size: 7, font: regular, color: COLORS.muted,
    });
  });

  return new Uint8Array(await pdf.save());
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

async function sendEmail(env, data, id, pdfBytes) {
  if (!env.EMAIL || typeof env.EMAIL.send !== 'function') {
    throw new Error('Cloudflare Email Service binding EMAIL is not configured.');
  }
  if (!env.CUSTOM_REQUEST_FROM_EMAIL) {
    throw new Error('CUSTOM_REQUEST_FROM_EMAIL is not configured.');
  }

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#412d20">
      <div style="background:#f8efd9;border-top:8px solid #d9653c;padding:28px">
        <h1 style="margin:0 0 8px;color:#4f8588">New Cozy Loops Custom Request</h1>
        <p style="margin:0 0 22px;color:#6f5b49">Request <strong>${escapeHtml(id)}</strong></p>
        <table style="width:100%;border-collapse:collapse;background:white;border:1px solid #dfd1b8">
          <tr><td style="padding:10px;font-weight:bold">Customer</td><td style="padding:10px">${escapeHtml(data.name)}</td></tr>
          <tr><td style="padding:10px;font-weight:bold">Email</td><td style="padding:10px">${escapeHtml(data.email)}</td></tr>
          <tr><td style="padding:10px;font-weight:bold">Item</td><td style="padding:10px">${escapeHtml(data.itemType)}</td></tr>
          <tr><td style="padding:10px;font-weight:bold">Size</td><td style="padding:10px">${escapeHtml(data.size)}</td></tr>
          <tr><td style="padding:10px;font-weight:bold">Colors</td><td style="padding:10px">${escapeHtml(data.colors)}</td></tr>
        </table>
        <p style="margin-top:22px">The complete custom request is attached as a branded PDF.</p>
      </div>
    </div>`;

  return env.EMAIL.send({
    from: env.CUSTOM_REQUEST_FROM_EMAIL,
    to: RECIPIENT_EMAIL,
    replyTo: data.email,
    subject: `Cozy Loops custom request — ${data.name} — ${id}`,
    html,
    text: `New Cozy Loops custom request ${id} from ${data.name} (${data.email}). The complete request is attached as a PDF.`,
    attachments: [{
      filename: `Cozy-Loops-Custom-Request-${id}.pdf`,
      content: bytesToBase64(pdfBytes),
      type: 'application/pdf',
      disposition: 'attachment',
    }],
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const length = Number(request.headers.get('content-length') || 0);
    if (length > MAX_BODY_BYTES) return json({ error: 'Request is too large.' }, 413);

    let raw;
    try { raw = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
    const data = normalizePayload(raw);
    const errors = validate(data);
    if (errors.length) return json({ error: errors[0], errors }, 400);

    const id = requestId();
    const submittedAt = new Date();
    let logoBytes = null;
    try {
      const logoResponse = await env.ASSETS.fetch(new Request(new URL('/logo-email.png', request.url)));
      if (logoResponse.ok) logoBytes = new Uint8Array(await logoResponse.arrayBuffer());
    } catch { /* PDF remains branded without logo */ }

    const pdfBytes = await buildPdf(data, id, submittedAt, logoBytes);
    await sendEmail(env, data, id, pdfBytes);

    return json({ ok: true, requestId: id, message: 'Your custom request was sent successfully.' });
  } catch (error) {
    console.error('Custom request failed:', error?.message || error);
    return json({ error: 'We could not send your custom request right now. Please try again shortly.' }, 502);
  }
}
