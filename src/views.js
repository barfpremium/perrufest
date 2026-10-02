import { html, raw, md } from './util.js';
import { icon } from './icons.js';

// Dirección base de las fotos y archivos subidos (dominio público de R2 si está configurado)
let MEDIA = '/media';
export function setMediaBase(url) { MEDIA = url ? url.replace(/\/$/, '') : '/media'; }

// ---------- Ayudantes de URL ----------
export const photoUrl = (p, size) => `${MEDIA}/photos/${p.event_id}/${p.file}-${size}.jpg`;
export const fileUrl = (f) => (!f ? '' : f.startsWith('/') ? f : `${MEDIA}/${f}`);
const digits = (s) => String(s || '').replace(/\D/g, '');
function waUrl(num, text) {
  let d = digits(num);
  if (d.length === 9) d = '34' + d; // número español sin prefijo
  return `https://wa.me/${d}${text ? '?text=' + encodeURIComponent(text) : ''}`;
}
function igUrl(v) {
  v = String(v || '').trim();
  if (!v) return '';
  if (/^https?:\/\//.test(v)) return v;
  return `https://www.instagram.com/${v.replace(/^@/, '')}/`;
}
const igHandle = (v) => {
  v = String(v || '').trim();
  const m = v.match(/instagram\.com\/([^/?#]+)/);
  return '@' + (m ? m[1] : v.replace(/^@/, ''));
};
export const mapsUrl = (e) => e.maps_url || (e.address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(e.address)}` : '');

function pending(label, cls = '') {
  return html`<span class="pending ${cls}" title="Dato provisional: complétalo desde el panel de gestión">${label} · pendiente</span>`;
}
function fillOrg(text, s) {
  const map = {
    org_name: s.org_name || '[PENDIENTE: nombre de la entidad]',
    org_nif: s.org_nif || '[PENDIENTE: NIF/CIF]',
    org_address: s.org_address || '[PENDIENTE: domicilio]',
    org_email: s.org_email || s.contact_email || '[PENDIENTE: correo]',
  };
  return String(text || '').replace(/\{(org_name|org_nif|org_address|org_email)\}/g, (_, k) => map[k]);
}

// ---------- Vídeos ----------
export function videoEmbed(v) {
  if (v.file) {
    return html`<figure class="video"><video controls preload="metadata" playsinline src="${fileUrl(v.file)}"></video>${v.title ? html`<figcaption>${v.title}</figcaption>` : ''}</figure>`;
  }
  const url = String(v.url || '');
  let m; let src = '';
  if ((m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/))) src = `https://www.youtube-nocookie.com/embed/${m[1]}`;
  else if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/))) src = `https://player.vimeo.com/video/${m[1]}`;
  if (src) {
    return html`<figure class="video"><div class="video-frame"><iframe src="${src}" title="${v.title || 'Vídeo resumen'}" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>${v.title ? html`<figcaption>${v.title}</figcaption>` : ''}</figure>`;
  }
  return html`<p><a class="btn btn-ghost" href="${url}" target="_blank" rel="noopener">${icon('play')} ${v.title || 'Ver el vídeo'}</a></p>`;
}

// ---------- Plantilla general ----------
function layout(ctx, { title, description, path, ogImage, body, active, bodyClass = '', scripts = [] }) {
  const s = ctx.settings;
  const fullTitle = title ? `${title} · ${s.site_name}` : `${s.site_name} · ${s.site_tagline}`;
  const desc = description || s.intro_text;
  const og = ogImage || (s.logo ? fileUrl(s.logo) : s.hero_image ? fileUrl(s.hero_image) : '');
  const abs = (u) => (u && u.startsWith('/') ? ctx.origin + u : u);
  const nav = [
    ['inicio', '/', 'Inicio', 'Inicio', 'home'],
    ['eventos', '/proximos-eventos', 'Próximos eventos', 'Eventos', 'calendar'],
    ['galeria', '/galeria', 'Galería', 'Galería', 'images'],
    ['participa', '/participa', 'Participa / Contacto', 'Participa', 'chat'],
  ];
  return html`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${fullTitle}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${ctx.origin + path}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${s.site_name}">
<meta property="og:title" content="${title || s.site_name + ' · ' + s.site_tagline}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${ctx.origin + path}">
${og ? html`<meta property="og:image" content="${abs(og)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<meta name="theme-color" content="${s.color_primary}">
<link rel="icon" href="/static/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/css/site.css?v=${ctx.version}">
<style>:root{--c1:${s.color_primary};--c2:${s.color_secondary};--c3:${s.color_accent}}</style>
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Saltar al contenido</a>
<header class="topbar">
  <div class="wrap topbar-in">
    <a class="brand" href="/" aria-label="${s.site_name}, inicio">
      ${icon('paw', 'ic brand-paw')}<span class="wordmark">${s.site_name}</span>
    </a>
    <nav class="mainnav" aria-label="Menú principal">
      ${nav.map(([k, href, long, short, ic]) => html`<a href="${href}"${active === k ? raw(' aria-current="page"') : ''}>${icon(ic)}<span class="l-long">${long}</span><span class="l-short">${short}</span></a>`)}
    </nav>
  </div>
</header>
<main id="main">
${body}
</main>
${footer(ctx)}
<script src="/static/js/site.js?v=${ctx.version}" defer></script>
${scripts.map((src) => html`<script src="${src}?v=${ctx.version}" defer></script>`)}
</body>
</html>`;
}

function contactLinks(s, { big = false } = {}) {
  const cls = big ? 'chip chip-lg' : 'chip';
  return html`<div class="contact-links">
    ${s.whatsapp ? html`<a class="${cls}" href="${waUrl(s.whatsapp, 'Hola, os escribo desde la web de Perrufest')}" target="_blank" rel="noopener">${icon('whatsapp')} WhatsApp</a>` : pending('WhatsApp', 'chip')}
    ${s.contact_email ? html`<a class="${cls}" href="mailto:${s.contact_email}">${icon('mail')} ${s.contact_email}</a>` : pending('Correo', 'chip')}
    ${s.instagram ? html`<a class="${cls}" href="${igUrl(s.instagram)}" target="_blank" rel="noopener">${icon('instagram')} ${igHandle(s.instagram)}</a>` : pending('Instagram', 'chip')}
  </div>`;
}

function footer(ctx) {
  const s = ctx.settings;
  const orgs = ctx.organizers || [];
  return html`<footer class="footer">
  <div class="wrap">
    ${orgs.length && !ctx.orgsShown ? html`<section class="footer-partners" aria-labelledby="fp-t">
      <h2 id="fp-t">Organizan Perrufest</h2>
      <ul class="partner-logos">${orgs.map(partnerLogo)}</ul>
    </section>` : ''}
    <div class="footer-grid">
      <div>
        <p class="footer-brand">${s.site_name}</p>
        <p class="muted">${s.site_tagline}</p>
      </div>
      <div>
        <h2 class="footer-h">Titular de la web</h2>
        <p>${s.org_name || pending('Nombre de la entidad')}<br>
        ${s.org_nif ? html`NIF ${s.org_nif}` : pending('NIF/CIF')}<br>
        ${s.org_address || pending('Domicilio')}<br>
        ${s.org_email ? html`<a href="mailto:${s.org_email}">${s.org_email}</a>` : pending('Correo de la entidad')}</p>
      </div>
      <div>
        <h2 class="footer-h">Síguenos</h2>
        ${contactLinks(s)}
      </div>
    </div>
    <p class="footer-legal"><a href="/aviso-legal">Aviso legal</a> · <a href="/privacidad">Privacidad</a> · © ${new Date().getFullYear()} ${s.site_name}</p>
  </div>
</footer>`;
}

// ---------- Organizadores, ayuntamientos, patrocinadores y colaboradores ----------
/** Enlace de un colaborador: web, enlace de Instagram o @usuario */
export function partnerUrl(v) {
  v = String(v || '').trim();
  if (!v) return '';
  if (/^https?:\/\//.test(v)) return v;
  if (/^@[\w.]{1,30}$/.test(v)) return `https://www.instagram.com/${v.slice(1)}/`;
  if (/^[\w-]+(\.[\w-]+)*\.(com|es|org|net|eu|info|cat|io|me|app|shop|online)(\/\S*)?$/i.test(v)) return `https://${v}`; // p. ej. instagram.com/usuario o miweb.es
  if (/^[\w.]{1,30}$/.test(v)) return `https://www.instagram.com/${v}/`; // usuario de Instagram sin @
  return '';
}
const isInstagram = (u) => /instagram\.com\//.test(u);
function partnerLogo(p) {
  const href = partnerUrl(p.url);
  const inner = p.logo ? html`<img src="${fileUrl(p.logo)}" alt="${p.name}" loading="lazy">` : html`<span class="partner-name">${p.name}</span>`;
  const ig = href && isInstagram(href) ? icon('instagram', 'ic ic-sm') : '';
  const cap = p.logo ? html`<span class="partner-cap">${p.name} ${ig}</span>` : (ig ? html`<span class="partner-cap">${ig} Instagram</span>` : '');
  return href
    ? html`<li><a href="${href}" target="_blank" rel="noopener" title="${p.name}">${inner}${cap}</a></li>`
    : html`<li><div class="partner-box">${inner}${cap}</div></li>`;
}
const GROUPS = [
  ['organizador', 'Organizan', 'Organizan'],
  ['ayuntamiento', 'Ayuntamiento', 'Ayuntamientos'],
  ['patrocinador', 'Patrocinador', 'Patrocinadores'],
  ['colaborador', 'Colaborador', 'Colaboradores'],
];
/** Bloque con organizadores (siempre) + ayuntamiento, patrocinadores y colaboradores de una edición */
function partnersBlock(ctx, partners, edition) {
  const list = [...(ctx.organizers || []), ...partners];
  if (!list.length) return '';
  if (ctx.organizers?.length) ctx.orgsShown = true; // evita repetirlos en el pie
  return html`<section class="block partners" aria-labelledby="pt-t">
    <h2 id="pt-t" class="h-sec">Quién hace posible Perrufest</h2>
    ${edition && partners.length ? html`<p class="muted">Edición de ${edition.town} · ${edition.dateLabel}</p>` : ''}
    <div class="partner-groups">
    ${GROUPS.map(([k, one, many]) => {
      const g = list.filter((p) => (p.kind || 'colaborador') === k);
      return g.length ? html`<div class="partner-group partner-${k}"><h3 class="partners-h">${g.length === 1 ? one : many}</h3><ul class="partner-logos">${g.map(partnerLogo)}</ul></div>` : '';
    })}
    </div>
  </section>`;
}

// ---------- Tarjetas ----------
function coverImg(e, sizes = '(min-width: 900px) 33vw, 100vw') {
  if (e.cover) return html`<img src="${photoUrl(e.cover, 't')}" srcset="${photoUrl(e.cover, 't')} 600w, ${photoUrl(e.cover, 'm')} 1600w" sizes="${sizes}" alt="" loading="lazy">`;
  if (e.poster) return html`<img src="${fileUrl(e.poster)}" alt="" loading="lazy">`;
  return html`<div class="ph-img">${icon('images')}<span>Portada pendiente</span></div>`;
}
function galleryCard(e) {
  return html`<li class="g-card">
    <a href="/galeria/${e.slug}">
      <div class="g-card-img">${coverImg(e)}</div>
      <div class="g-card-body">
        <span class="badge badge-past">Celebrado</span>
        <h3>${e.displayTitle}</h3>
        <p class="muted">${e.dateLabel}</p>
        <p class="g-count">${e.photoCount ? `${e.photoCount} fotos` : 'Fotos en preparación'}</p>
      </div>
    </a>
  </li>`;
}
function eventCard(e) {
  return html`<li class="e-card">
    <a href="/eventos/${e.slug}">
      <div class="e-card-img">${e.poster ? html`<img src="${fileUrl(e.poster)}" alt="Cartel de ${e.displayTitle}" loading="lazy">` : html`<div class="ph-img">${icon('calendar')}<span>Cartel pendiente</span></div>`}</div>
      <div class="e-card-body">
        <span class="badge badge-next">Próximo</span>
        <h3>${e.displayTitle}</h3>
        <p><strong>${e.dateLabel}</strong></p>
        ${e.venue ? html`<p class="muted">${icon('pin')} ${e.venue}</p>` : ''}
        <span class="link-arrow">Ver detalles ${icon('arrow')}</span>
      </div>
    </a>
  </li>`;
}

// Logo completo (banner). El logo incluido de serie tiene dos tamaños para cargar rápido en el móvil.
const DEFAULT_LOGO = '/static/img/perrufest-logo-1600.jpg';
function logoImg(s, loading = 'lazy') {
  const alt = `${s.site_name} · ${s.site_tagline}`;
  if (s.logo === DEFAULT_LOGO) {
    return html`<img src="/static/img/perrufest-logo-1600.jpg" srcset="/static/img/perrufest-logo-800.jpg 800w, /static/img/perrufest-logo-1600.jpg 1600w" sizes="(min-width: 1180px) 1140px, 100vw" width="1600" height="533" alt="${alt}" loading="${loading}">`;
  }
  return html`<img src="${fileUrl(s.logo)}" alt="${alt}" loading="${loading}">`;
}

// ---------- Páginas ----------
function home(ctx, { featured, upcoming, edition, editionPartners = [] }) {
  const s = ctx.settings;
  const body = html`
<section class="hero">
  <div class="wrap">
    <h1 class="hero-logo">
      ${s.logo ? logoImg(s, 'eager') : html`<div class="ph-box ph-logo"><strong>${s.site_name}</strong><span>${s.site_tagline}</span><em>Logo completo pendiente de subir</em></div>`}
    </h1>
    <div class="hero-in">
      <div class="hero-text">
        <p class="hero-title">${s.intro_title}</p>
        <p class="lead">${s.intro_text}</p>
        <div class="cta-row">
          <a class="btn btn-primary btn-lg" href="${featured ? `/galeria/${featured.slug}` : '/galeria'}">${icon('images')} Ver las fotos</a>
          <a class="btn btn-accent btn-lg" href="/participa">${icon('heart')} Quiero participar</a>
        </div>
      </div>
      <div class="hero-photo">
        ${s.hero_image ? html`<img src="${fileUrl(s.hero_image)}" alt="Ambiente del festival Perrufest">`
    : html`<div class="ph-box ph-photo">${icon('images', 'ic ic-xl')}<strong>Fotografía principal del festival</strong><em>Pendiente de subir desde el panel</em></div>`}
      </div>
    </div>
  </div>
</section>

${featured ? html`<section class="wrap block">
  <a class="featured" href="/galeria/${featured.slug}">
    <div class="featured-img">${coverImg(featured, '(min-width: 900px) 55vw, 100vw')}</div>
    <div class="featured-body">
      <span class="eyebrow">Galería</span>
      <h2>Revive Perrufest ${featured.town}</h2>
      <p class="featured-date">${featured.displayTitle} · ${featured.dateLabel}</p>
      <p>${featured.photoCount ? `${featured.photoCount} fotos para ver, descargar y compartir.` : 'Estamos preparando las fotos y vídeos de esta edición.'}</p>
      <span class="btn btn-primary">Ver las fotos ${icon('arrow')}</span>
    </div>
  </a>
</section>` : ''}

<section class="wrap block" aria-labelledby="prop-t">
  <h2 id="prop-t" class="h-sec">Qué encontrarás</h2>
  <ul class="features">
    ${s.featuresList.filter((f) => f.title).map((f) => html`<li class="feature">
      <span class="feature-ic">${icon(f.icon)}</span>
      <h3>${f.title}</h3>
      <p>${f.text}</p>
    </li>`)}
  </ul>
</section>

<section class="wrap block" aria-labelledby="next-t">
  <div class="sec-head"><h2 id="next-t" class="h-sec">Próximos eventos</h2>${upcoming.length ? html`<a class="link-arrow" href="/proximos-eventos">Ver todos ${icon('arrow')}</a>` : ''}</div>
  ${upcoming.length ? html`<ul class="e-list">${upcoming.slice(0, 3).map(eventCard)}</ul>` : emptyUpcoming(s)}
</section>

<div class="wrap">${partnersBlock(ctx, editionPartners, edition)}</div>

<section class="wrap block">
  <div class="cta-band">
    <div>
      <h2>¿Te animas a participar?</h2>
      <p>${s.participate_text}</p>
    </div>
    <div class="cta-band-actions">
      <a class="btn btn-light btn-lg" href="/participa">Quiero participar ${icon('arrow')}</a>
      ${contactLinks(s)}
    </div>
  </div>
</section>`;
  return layout(ctx, { path: '/', body, active: 'inicio', bodyClass: 'p-home' });
}

function emptyUpcoming(s) {
  return html`<div class="empty">${icon('calendar', 'ic ic-xl')}<p>${s.upcoming_empty}</p><p class="muted">Síguenos para enterarte la primera.</p>${contactLinks(s)}</div>`;
}

function upcomingPage(ctx, { upcoming, past }) {
  const body = html`
<div class="wrap page-head">
  <h1>Próximos eventos</h1>
  <p class="lead">Dónde y cuándo será el próximo Perrufest.</p>
</div>
<section class="wrap block">
  ${upcoming.length ? html`<ul class="e-list">${upcoming.map(eventCard)}</ul>` : emptyUpcoming(ctx.settings)}
</section>
${past.length ? html`<section class="wrap block" aria-labelledby="past-t">
  <h2 id="past-t" class="h-sec">Ediciones celebradas</h2>
  <ul class="g-list">${past.map(galleryCard)}</ul>
</section>` : ''}`;
  return layout(ctx, { title: 'Próximos eventos', path: '/proximos-eventos', body, active: 'eventos' });
}

function programList(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return '';
  const out = []; let items = [];
  const flush = () => { if (items.length) out.push(html`<ul class="program">${items}</ul>`); items = []; };
  for (const l of lines) {
    if (l.startsWith('#')) { flush(); out.push(html`<h3 class="program-day">${l.replace(/^#+\s*/, '')}</h3>`); continue; }
    const m = l.match(/^(\d{1,2}[:.]\d{2}(?:\s*[-–a]\s*\d{1,2}[:.]\d{2})?)\s*[|·-]?\s*(.*)$/);
    items.push(m ? html`<li><span class="p-time">${m[1]}</span><span>${m[2]}</span></li>` : html`<li><span class="p-time"></span><span>${l}</span></li>`);
  }
  flush();
  return out;
}

function eventPage(ctx, { e, partners, videos }) {
  const maps = mapsUrl(e);
  const body = html`
<article class="wrap event">
  <div class="page-head">
    <span class="badge ${e.isPast ? 'badge-past' : 'badge-next'}">${e.isPast ? 'Edición celebrada' : 'Próximo evento'}</span>
    <h1>${e.title ? e.title : html`Perrufest ${e.town}`}</h1>
    <p class="lead"><strong>${e.dateLabel}</strong>${e.venue ? html` · ${e.venue}` : ''}</p>
  </div>
  ${e.isPast ? html`<a class="notice" href="/galeria/${e.slug}">${icon('images')} Esta edición ya se celebró. <strong>Ver las fotos</strong></a>` : ''}
  <div class="event-grid">
    <div class="event-poster">
      ${e.poster ? html`<a href="${fileUrl(e.poster)}" target="_blank"><img src="${fileUrl(e.poster)}" alt="Cartel de Perrufest ${e.town}"></a>`
    : html`<div class="ph-box ph-poster">${icon('calendar', 'ic ic-xl')}<strong>Cartel</strong><em>Pendiente de publicar</em></div>`}
    </div>
    <div class="event-info">
      <dl class="facts">
        <div><dt>${icon('pin')} Lugar</dt><dd>${e.town}${e.venue ? html`<br>${e.venue}` : ''}${e.address ? html`<br><span class="muted">${e.address}</span>` : ''}</dd></div>
        <div><dt>${icon('calendar')} Fechas</dt><dd>${e.dateLabel}</dd></div>
        ${e.schedule ? html`<div><dt>${icon('clock')} Horario</dt><dd>${md(e.schedule)}</dd></div>` : ''}
        ${e.prices ? html`<div><dt>${icon('ticket')} Precios</dt><dd>${md(e.prices)}</dd></div>` : ''}
      </dl>
      ${maps ? html`<a class="btn btn-primary" href="${maps}" target="_blank" rel="noopener">${icon('pin')} Cómo llegar</a>` : ''}
      ${e.access ? html`<section class="sub"><h2>Condiciones de acceso</h2>${md(e.access)}</section>` : ''}
    </div>
  </div>
  ${e.program ? html`<section class="block"><h2 class="h-sec">Programa</h2>${programList(e.program)}</section>` : ''}
  ${!e.isPast && videos.length ? html`<section class="block">${videos.map(videoEmbed)}</section>` : ''}
  ${partnersBlock(ctx, partners, e)}
  ${!e.isPast ? html`<div class="cta-band block"><div><h2>¿Quieres participar en esta edición?</h2><p>${ctx.settings.participate_text}</p></div><a class="btn btn-light btn-lg" href="/participa">Quiero participar ${icon('arrow')}</a></div>` : ''}
</article>`;
  return layout(ctx, {
    title: `Perrufest ${e.town}`, description: `${e.dateLabel}${e.venue ? ' · ' + e.venue : ''}. Festival perruno familiar.`,
    path: `/eventos/${e.slug}`, ogImage: e.poster ? fileUrl(e.poster) : e.cover ? photoUrl(e.cover, 'm') : '', body, active: 'eventos',
  });
}

function galleryIndex(ctx, { past }) {
  const body = html`
<div class="wrap page-head">
  <h1>Galería</h1>
  <p class="lead">Fotos y vídeos de cada edición. Ábrelas, descárgalas y compártelas.</p>
</div>
<section class="wrap block">
  ${past.length ? html`<ul class="g-list">${past.map(galleryCard)}</ul>` : html`<div class="empty">${icon('images', 'ic ic-xl')}<p>Todavía no hay galerías publicadas.</p></div>`}
</section>`;
  return layout(ctx, { title: 'Galería', path: '/galeria', body, active: 'galeria' });
}

function galleryPage(ctx, { e, photos, videos, partners }) {
  const groups = [...new Set(photos.map((p) => p.grp).filter(Boolean))];
  const data = photos.map((p) => ({ id: p.id, t: photoUrl(p, 't'), m: photoUrl(p, 'm'), w: p.w, h: p.h, g: p.grp || '' }));
  const shareText = `Fotos de Perrufest ${e.town} · ${e.dateLabel}`;
  const body = html`
<div class="wrap page-head">
  <p class="crumbs"><a href="/galeria">Galería</a> / ${e.town}</p>
  <h1>${e.displayTitle}</h1>
  <p class="lead">${e.dateLabel}${e.venue ? ` · ${e.venue}` : ''}</p>
  ${e.description ? html`<div class="desc">${md(e.description)}</div>` : ''}
  <div class="share-row">
    <button class="btn btn-primary" type="button" data-share data-title="${shareText}">${icon('share')} Compartir galería</button>
    <a class="btn btn-ghost" href="https://wa.me/?text=${encodeURIComponent(shareText + ' ' + ctx.origin + '/galeria/' + e.slug)}" target="_blank" rel="noopener">${icon('whatsapp')} WhatsApp</a>
    <button class="btn btn-ghost" type="button" data-copy="${ctx.origin}/galeria/${e.slug}">${icon('copy')} Copiar enlace</button>
  </div>
</div>
${videos.length ? html`<section class="wrap block videos" aria-label="Vídeos">${videos.map(videoEmbed)}</section>` : ''}
<section class="wrap block gallery-sec" aria-label="Fotografías">
  ${photos.length ? html`
    ${groups.length > 1 ? html`<div class="filters" role="toolbar" aria-label="Filtrar fotos">
      <button type="button" class="filter" aria-pressed="true" data-group="">Todas <span>${photos.length}</span></button>
      ${groups.map((g) => html`<button type="button" class="filter" aria-pressed="false" data-group="${g}">${g} <span>${photos.filter((p) => p.grp === g).length}</span></button>`)}
    </div>` : ''}
    <ul class="grid" id="grid" data-slug="${e.slug}">
      ${photos.slice(0, 24).map((p, i) => html`<li><a href="${photoUrl(p, 'm')}" data-i="${i}"><img src="${photoUrl(p, 't')}" alt="Foto ${i + 1} de ${photos.length}" width="${p.w}" height="${p.h}" loading="lazy" decoding="async"></a></li>`)}
    </ul>
    <div id="more" class="more" aria-live="polite"></div>
    <script type="application/json" id="photos-data">${raw(JSON.stringify(data).replace(/</g, '\\u003c'))}</script>
  ` : html`<div class="empty">${icon('images', 'ic ic-xl')}<p>Estamos preparando las fotos de esta edición. ¡Vuelve muy pronto!</p></div>`}
  <p class="takedown">¿Apareces en alguna foto y prefieres que la retiremos? <a href="/participa?retirada=${e.slug}">Solicita su retirada</a>.</p>
</section>
<div class="wrap">${partnersBlock(ctx, partners, e)}</div>
${lightbox()}`;
  return layout(ctx, {
    title: `Fotos de ${e.displayTitle}`, description: `${e.dateLabel}. ${photos.length ? photos.length + ' fotos para ver, descargar y compartir.' : 'Galería de Perrufest.'}`,
    path: `/galeria/${e.slug}`, ogImage: e.cover ? photoUrl(e.cover, 'm') : '', body, active: 'galeria', bodyClass: 'p-gallery',
    scripts: ['/static/js/gallery.js'],
  });
}

function lightbox() {
  return html`<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="Visor de fotos" hidden>
  <div class="lb-top">
    <span class="lb-count" id="lb-count"></span>
    <div class="lb-actions">
      <a class="lb-btn" id="lb-dl" href="#" download>${icon('download')}<span>Descargar</span></a>
      <button class="lb-btn" id="lb-share" type="button">${icon('share')}<span>Compartir</span></button>
      <button class="lb-btn" id="lb-close" type="button" aria-label="Cerrar">${icon('close')}<span>Cerrar</span></button>
    </div>
  </div>
  <div class="lb-stage" id="lb-stage">
    <img id="lb-img" alt="">
    <div class="lb-spin" aria-hidden="true"></div>
  </div>
  <button class="lb-nav lb-prev" id="lb-prev" type="button" aria-label="Foto anterior">${icon('left')}</button>
  <button class="lb-nav lb-next" id="lb-next" type="button" aria-label="Foto siguiente">${icon('right')}</button>
  <a class="lb-report" id="lb-report" href="#">Solicitar retirada de esta foto</a>
</div>`;
}

export const KINDS = [
  ['puesto', 'Puesto'],
  ['actividad', 'Actividad o exhibición'],
  ['patrocinio', 'Patrocinio o colaboración'],
  ['localidad', 'Propuesta de localidad'],
  ['otra', 'Otra consulta'],
];

function participaPage(ctx, { values = {}, errors = {}, sent = false } = {}) {
  const s = ctx.settings;
  const v = (k) => values[k] || '';
  const err = (k) => (errors[k] ? html`<p class="f-err" id="e-${k}">${errors[k]}</p>` : html`<p class="f-err" id="e-${k}" hidden></p>`);
  const inv = (k) => (errors[k] ? raw(' aria-invalid="true"') : '');
  const body = html`
<div class="wrap page-head">
  <h1>Participa / Contacto</h1>
  <p class="lead">${s.participate_text}</p>
  ${contactLinks(s, { big: true })}
</div>
<section class="wrap block form-wrap">
  <div class="form-ok" id="form-ok" ${sent ? '' : raw('hidden')} tabindex="-1">
    ${icon('heart', 'ic ic-xl')}
    <h2>¡Gracias! Hemos recibido tu mensaje</h2>
    <p>Te responderemos lo antes posible en el correo que nos has indicado.</p>
    <a class="btn btn-ghost" href="/participa">Enviar otro mensaje</a>
  </div>
  <form class="form" id="contact-form" method="post" action="/participa" novalidate ${sent ? raw('hidden') : ''}>
    ${errors._form ? html`<p class="form-alert" role="alert">${errors._form}</p>` : html`<p class="form-alert" role="alert" hidden></p>`}
    <div class="f-row">
      <label for="f-name">Nombre <span class="req">*</span></label>
      <input id="f-name" name="name" autocomplete="name" required maxlength="120" value="${v('name')}"${inv('name')}>
      ${err('name')}
    </div>
    <div class="f-row">
      <label for="f-entity">Negocio o entidad <span class="opt">(si corresponde)</span></label>
      <input id="f-entity" name="entity" autocomplete="organization" maxlength="160" value="${v('entity')}">
    </div>
    <div class="f-2">
      <div class="f-row">
        <label for="f-email">Correo electrónico <span class="req">*</span></label>
        <input id="f-email" name="email" type="email" autocomplete="email" inputmode="email" required maxlength="160" value="${v('email')}"${inv('email')}>
        ${err('email')}
      </div>
      <div class="f-row">
        <label for="f-phone">Teléfono <span class="opt">(opcional)</span></label>
        <input id="f-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="40" value="${v('phone')}"${inv('phone')}>
        ${err('phone')}
      </div>
    </div>
    <fieldset class="f-row">
      <legend>Tipo de participación <span class="req">*</span></legend>
      <div class="radios">
        ${KINDS.map(([k, label]) => html`<label class="radio"><input type="radio" name="kind" value="${k}" required${v('kind') === k ? raw(' checked') : ''}><span>${label}</span></label>`)}
      </div>
      ${err('kind')}
    </fieldset>
    <div class="f-row">
      <label for="f-msg">Mensaje <span class="req">*</span></label>
      <textarea id="f-msg" name="message" rows="6" required minlength="10" maxlength="4000"${inv('message')}>${v('message')}</textarea>
      ${err('message')}
    </div>
    <div class="hp" aria-hidden="true"><label>No rellenes este campo <input name="website" tabindex="-1" autocomplete="off"></label></div>
    <input type="hidden" name="ts" value="${values.ts || Date.now()}">
    <div class="privacy-box">
      <p><strong>Información básica sobre protección de datos.</strong> Responsable: ${s.org_name || pending('entidad organizadora')}. Finalidad: responder a tu solicitud y gestionar tu posible participación o colaboración en Perrufest. Legitimación: tu consentimiento. Destinatarios: no se ceden datos a terceros salvo obligación legal. Derechos: acceso, rectificación, supresión y otros, como se explica en la <a href="/privacidad" target="_blank">política de privacidad</a>.</p>
      <label class="check"><input type="checkbox" name="privacy" value="1" required${v('privacy') ? raw(' checked') : ''}${inv('privacy')}><span>He leído y acepto la <a href="/privacidad" target="_blank">política de privacidad</a>. <span class="req">*</span></span></label>
      ${err('privacy')}
    </div>
    <button class="btn btn-primary btn-lg btn-block" type="submit">Enviar mensaje</button>
  </form>
</section>`;
  return layout(ctx, { title: 'Participa / Contacto', path: '/participa', body, active: 'participa' });
}

function legalPage(ctx, { title, text, path }) {
  const body = html`<article class="wrap page-head prose"><h1>${title}</h1>${md(fillOrg(text, ctx.settings))}</article>`;
  return layout(ctx, { title, path, body });
}

function notFound(ctx) {
  const body = html`<div class="wrap page-head empty"><h1>Página no encontrada</h1><p>Puede que el enlace haya cambiado.</p><a class="btn btn-primary" href="/">Ir al inicio</a></div>`;
  return layout(ctx, { title: 'No encontrado', path: '/', body });
}

export { home, upcomingPage, eventPage, galleryIndex, galleryPage, participaPage, legalPage, notFound };
