// Perrufest · Cloudflare Worker
// Los archivos de /public (CSS, JS, imágenes fijas) los sirve Cloudflare directamente.
// Este código atiende las páginas, el formulario, el panel /admin y las fotos guardadas en R2.
import { readForm } from './util.js';
import * as data from './data.js';
import * as views from './views.js';
import { handleAdmin } from './admin.js';

// Dirección pública de R2 (p. ej. https://fotos.tudominio.es). Si está mal escrita se ignora.
function mediaOrigin(env) {
  let v = String(env.MEDIA_URL || '').trim();
  if (!v) return '';
  if (!/^https?:\/\//.test(v)) v = 'https://' + v;
  try { return new URL(v).origin; } catch { return ''; }
}
const SECURITY = (env) => {
  const media = mediaOrigin(env) ? ' ' + mediaOrigin(env) : '';
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': `default-src 'self'; img-src 'self' data: blob:${media}; media-src 'self' blob:${media}; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; connect-src 'self'${media}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
  };
};

function helpers(env, version) {
  const withSec = (headers) => ({ ...SECURITY(env), ...headers });
  return {
    version,
    page: (body, status = 200) => new Response(String(body), { status, headers: withSec({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }) }),
    json: (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: withSec({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }) }),
    text: (t, status = 200) => new Response(t, { status, headers: withSec({ 'Content-Type': 'text/plain; charset=utf-8' }) }),
    redirect: (to, extra = {}) => new Response(null, { status: 303, headers: { Location: to, ...extra } }),
  };
}

// ---------- Archivos de R2 (con soporte de rangos para vídeo) ----------
async function serveObject(request, env, key, { download = '' } = {}) {
  const head = await env.MEDIA.head(key);
  if (!head) return null;
  const headers = new Headers();
  head.writeHttpMetadata(headers);
  headers.set('ETag', head.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  if (download) headers.set('Content-Disposition', `attachment; filename="${download}"`);
  if (request.headers.get('if-none-match') === head.httpEtag) return new Response(null, { status: 304, headers });

  const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  if (m && !download) {
    let start = m[1] === '' ? head.size - Number(m[2]) : Number(m[1]);
    let end = m[1] !== '' && m[2] !== '' ? Number(m[2]) : head.size - 1;
    end = Math.min(end, head.size - 1);
    if (start < 0 || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${head.size}` } });
    const obj = await env.MEDIA.get(key, { range: { offset: start, length: end - start + 1 } });
    headers.set('Content-Range', `bytes ${start}-${end}/${head.size}`);
    headers.set('Content-Length', String(end - start + 1));
    return new Response(request.method === 'HEAD' ? null : obj.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(head.size));
  if (request.method === 'HEAD') return new Response(null, { headers });
  const obj = await env.MEDIA.get(key);
  return obj ? new Response(obj.body, { headers }) : null;
}

// ---------- Formulario de contacto ----------
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60e3);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 6;
}

function validateContact(f) {
  const errors = {}; const val = {};
  for (const k of ['name', 'entity', 'email', 'phone', 'kind', 'message', 'privacy', 'ts', 'website']) val[k] = String(f[k] ?? '').trim();
  if (!val.name) errors.name = 'Escribe tu nombre.';
  else if (val.name.length > 120) errors.name = 'El nombre es demasiado largo.';
  if (!val.email) errors.email = 'Escribe tu correo electrónico.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val.email) || val.email.length > 160) errors.email = 'Revisa el correo electrónico: parece incompleto.';
  if (val.phone && !/^[+\d\s().-]{6,25}$/.test(val.phone)) errors.phone = 'Revisa el teléfono (solo números, espacios y +).';
  if (!views.KINDS.some(([k]) => k === val.kind)) errors.kind = 'Elige el tipo de participación.';
  if (val.message.length < 10) errors.message = 'Cuéntanos un poco más (al menos 10 caracteres).';
  else if (val.message.length > 4000) errors.message = 'El mensaje es demasiado largo (máximo 4000 caracteres).';
  if (!val.privacy) errors.privacy = 'Necesitamos que aceptes la política de privacidad para poder responderte.';
  val.entity = val.entity.slice(0, 160);
  return { val, errors };
}

async function notify(env, id, val, c) {
  const to = c.settings.notify_email || c.settings.contact_email;
  if (!to || !env.RESEND_API_KEY) return;
  const kind = (views.KINDS.find(([k]) => k === val.kind) || [])[1] || val.kind;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.MAIL_FROM || 'Perrufest web <onboarding@resend.dev>',
        to: [to], reply_to: val.email,
        subject: `Perrufest · Nueva solicitud: ${kind} · ${val.name}`,
        text: `Nombre: ${val.name}\nEntidad: ${val.entity || '-'}\nCorreo: ${val.email}\nTeléfono: ${val.phone || '-'}\nTipo: ${kind}\n\n${val.message}\n\nVer en el panel: ${c.origin}/admin/mensajes`,
      }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  } catch (err) {
    console.error('Aviso por correo fallido:', err.message);
    await env.DB.prepare('UPDATE messages SET notify_error = ? WHERE id = ?').bind(String(err.message).slice(0, 300), id).run();
  }
}

async function postContact(request, env, ctx, c, h) {
  const wantsJson = /json/.test(request.headers.get('accept') || '');
  const { val, errors } = validateContact(await readForm(request));
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const reply = (status, payload) => (wantsJson ? h.json(payload, status)
    : h.page(views.participaPage(c, { values: val, errors: payload.errors || {} }), status));

  if (val.website) return wantsJson ? h.json({ ok: true }) : h.redirect('/participa?enviado=1'); // trampa anti-spam
  if (Object.keys(errors).length) return reply(400, { ok: false, errors });
  if (val.ts && Date.now() - Number(val.ts) < 2000) return reply(400, { ok: false, errors: { _form: 'Has enviado el formulario muy rápido. Revisa los datos y vuelve a pulsar «Enviar».' } });
  if (rateLimited(ip)) return reply(429, { ok: false, errors: { _form: 'Has enviado varios mensajes seguidos. Espera unos minutos y vuelve a intentarlo.' } });

  let id;
  try {
    id = (await env.DB.prepare('INSERT INTO messages (name, entity, email, phone, kind, message) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(val.name, val.entity, val.email, val.phone, val.kind, val.message).run()).meta.last_row_id;
  } catch (err) {
    console.error('No se pudo guardar el mensaje:', err);
    return reply(500, { ok: false, errors: { _form: 'No hemos podido guardar tu mensaje. Inténtalo de nuevo en unos minutos o escríbenos directamente.' } });
  }
  ctx.waitUntil(notify(env, id, val, c)); // el mensaje ya está guardado; el aviso va en segundo plano
  return wantsJson ? h.json({ ok: true }) : h.redirect('/participa?enviado=1');
}

// ---------- Rutas ----------
async function route(request, env, ctx) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const db = env.DB;
  const version = (env.CF_VERSION_METADATA?.id || 'dev').slice(0, 8);
  const h = helpers(env, version);
  views.setMediaBase(mediaOrigin(env));
  await data.init(db);
  let r;

  if (p.startsWith('/media/')) {
    let key; try { key = decodeURIComponent(p.slice(7)); } catch { key = ''; }
    if (/^(files|photos)\/[\w/.-]+$/.test(key) && !key.includes('..')) {
      const res = await serveObject(request, env, key);
      if (res) return res;
    }
    return h.text('No encontrado', 404);
  }
  if (p === '/robots.txt') return h.text('User-agent: *\nDisallow: /admin\n');
  if (p === '/admin' || p.startsWith('/admin/')) return handleAdmin(request, env, url, h);

  const c = {
    settings: await data.getSettings(db),
    origin: url.origin,
    version,
    organizers: await data.organizers(db),
  };
  if (request.method === 'POST' && p === '/participa') return postContact(request, env, ctx, c, h);
  if (request.method !== 'GET' && request.method !== 'HEAD') return h.text('Método no permitido', 405);

  if (p === '/') {
    let featured = null;
    if (c.settings.featured_event_id) {
      const e = await data.getEvent(db, Number(c.settings.featured_event_id));
      if (e && e.published) featured = e;
    }
    featured ||= (await data.pastEvents(db))[0] || null;
    const upcoming = await data.upcomingEvents(db);
    const edition = upcoming[0] || featured; // la edición «actual»: la próxima, o la última celebrada
    const editionPartners = edition ? await data.partnersOf(db, edition.id) : [];
    return h.page(views.home(c, { featured, upcoming, edition, editionPartners }));
  }
  if (p === '/proximos-eventos') return h.page(views.upcomingPage(c, { upcoming: await data.upcomingEvents(db), past: await data.pastEvents(db) }));
  if (p === '/galeria') return h.page(views.galleryIndex(c, { past: await data.pastEvents(db) }));
  if ((r = p.match(/^\/eventos\/([\w-]+)$/))) {
    const e = await data.getEventBySlug(db, r[1]);
    if (e && e.published) return h.page(views.eventPage(c, { e, partners: await data.partnersOf(db, e.id), videos: await data.videosOf(db, e.id) }));
  }
  if ((r = p.match(/^\/galeria\/([\w-]+)$/))) {
    const e = await data.getEventBySlug(db, r[1]);
    if (e && e.published) {
      const [photos, videos, partners] = await Promise.all([data.photosOf(db, e.id), data.videosOf(db, e.id), data.partnersOf(db, e.id)]);
      return h.page(views.galleryPage(c, { e, photos, videos, partners }));
    }
  }
  if ((r = p.match(/^\/foto\/(\d+)\/descargar$/))) {
    const ph = await data.one(db, 'SELECT p.*, e.slug, e.published FROM photos p JOIN events e ON e.id = p.event_id WHERE p.id = ?', Number(r[1]));
    if (ph && ph.published) {
      const res = await serveObject(request, env, `photos/${ph.event_id}/${ph.file}-o.jpg`, { download: `perrufest-${ph.slug}-${ph.id}.jpg` });
      if (res) return res;
    }
  }
  if (p === '/participa') {
    const values = {};
    const ret = url.searchParams.get('retirada');
    if (ret) {
      const foto = url.searchParams.get('foto');
      values.kind = 'otra';
      values.message = `Solicito la retirada de ${foto ? 'esta fotografía' : 'una fotografía'} de la galería:\n${c.origin}/galeria/${ret.replace(/[^\w-]/g, '')}${foto ? '#foto-' + foto.replace(/\D/g, '') : ''}\n\nMotivo (opcional): `;
    }
    return h.page(views.participaPage(c, { values, sent: url.searchParams.get('enviado') === '1' }));
  }
  if (p === '/aviso-legal') return h.page(views.legalPage(c, { title: 'Aviso legal', text: c.settings.legal_text, path: p }));
  if (p === '/privacidad') return h.page(views.legalPage(c, { title: 'Política de privacidad', text: c.settings.privacy_text, path: p }));

  return h.page(views.notFound(c), 404);
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (err) {
      console.error(err);
      const status = err.status || 500;
      return new Response(status === 400 ? err.message : 'Ha ocurrido un error. Inténtalo de nuevo en unos segundos.', { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  },
};
