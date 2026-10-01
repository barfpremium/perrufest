// Utilidades comunes (compatibles con Cloudflare Workers y Node 22: solo APIs web estándar)

// ---------- HTML seguro ----------
export class Raw { constructor(s) { this.s = String(s); } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
function fmt(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(fmt).join('');
  if (v instanceof Raw) return v.s;
  return esc(v);
}
/** Plantilla que escapa todo lo interpolado salvo lo marcado con raw() u otro html`` */
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += fmt(vals[i]) + strings[i + 1];
  return new Raw(out);
}

// ---------- Texto ----------
export function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

/** Markdown muy reducido: párrafos, ## títulos, listas con "- ", **negrita**, [texto](url) */
export function md(src) {
  const inline = (t) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:|\/)[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const blocks = String(src || '').replace(/\r/g, '').split(/\n{2,}/);
  return raw(blocks.map((b) => {
    b = b.trim();
    if (!b) return '';
    if (/^###?\s/.test(b)) {
      const [first, ...rest] = b.split('\n');
      const h = `<h2>${inline(first.replace(/^###?\s/, ''))}</h2>`;
      return rest.length ? h + md(rest.join('\n')).s : h;
    }
    const lines = b.split('\n');
    if (lines.every((l) => /^\s*[-*]\s/.test(l))) {
      return '<ul>' + lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s/, ''))}</li>`).join('') + '</ul>';
    }
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('\n'));
}

// ---------- Fechas (zona Madrid) ----------
export function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const parts = (iso) => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d }; };
export function formatRange(start, end) {
  if (!start) return '';
  const a = parts(start);
  if (!end || end === start) return `${a.d} de ${MONTHS[a.m - 1]} de ${a.y}`;
  const b = parts(end);
  const days = Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 864e5);
  if (a.y === b.y && a.m === b.m) {
    return days === 1 ? `${a.d} y ${b.d} de ${MONTHS[a.m - 1]} de ${a.y}` : `Del ${a.d} al ${b.d} de ${MONTHS[a.m - 1]} de ${a.y}`;
  }
  if (a.y === b.y) return `Del ${a.d} de ${MONTHS[a.m - 1]} al ${b.d} de ${MONTHS[b.m - 1]} de ${b.y}`;
  return `Del ${a.d} de ${MONTHS[a.m - 1]} de ${a.y} al ${b.d} de ${MONTHS[b.m - 1]} de ${b.y}`;
}

// ---------- Cookies y firma (Web Crypto) ----------
export function parseCookies(request) {
  const out = {};
  for (const part of String(request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* cookie mal formada */ } }
  }
  return out;
}
const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const hmacKey = (secret, usage) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);

export async function sign(value, secret) {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), enc.encode(value));
  return `${value}.${b64url(sig)}`;
}
export async function unsign(signed, secret) {
  if (!signed) return null;
  const i = signed.lastIndexOf('.');
  if (i < 0) return null;
  const value = signed.slice(0, i);
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), fromB64url(signed.slice(i + 1)), enc.encode(value));
    return ok ? value : null;
  } catch { return null; }
}
/** Comparación en tiempo constante de dos textos */
export async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(String(a))), crypto.subtle.digest('SHA-256', enc.encode(String(b)))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
export const uid = () => b64url(crypto.getRandomValues(new Uint8Array(9)));

// ---------- Cuerpos de petición ----------
export async function readForm(request) {
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    try { return (await request.json()) || {}; } catch { return {}; }
  }
  const out = {};
  for (const [k, v] of new URLSearchParams(await request.text())) {
    if (k.endsWith('[]')) (out[k.slice(0, -2)] ||= []).push(v);
    else out[k] = v;
  }
  return out;
}

/** Detecta el tipo real de una imagen por sus primeros bytes */
export function sniffImage(u8) {
  const s = (a, b) => String.fromCharCode(...u8.subarray(a, b));
  if (u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return 'jpg';
  if (u8[0] === 0x89 && s(1, 4) === 'PNG') return 'png';
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') return 'webp';
  return null;
}
