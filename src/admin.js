// Panel de gestión de Perrufest (/admin)
import { html, raw, slugify, parseCookies, sign, unsign, safeEqual, readForm, sniffImage, uid, formatRange } from './util.js';
import * as data from './data.js';
import { photoUrl, fileUrl, KINDS, partnerUrl } from './views.js';
import { ICON_NAMES } from './icons.js';

const COOKIE = 'pf_admin';
const DEFAULT_LOGO = '/static/img/perrufest-logo-1600.jpg';
const attempts = new Map();
const kindLabel = (k) => (KINDS.find(([x]) => x === k) || [k, k])[1];

// ---------- Sesión ----------
async function secretOf(env) {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  const row = await data.one(env.DB, "SELECT value FROM settings WHERE key = '_secret'");
  if (row) return row.value;
  const s = uid() + uid() + uid() + uid();
  await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('_secret', ?)").bind(s).run();
  return (await data.one(env.DB, "SELECT value FROM settings WHERE key = '_secret'")).value;
}
async function isLogged(request, env) {
  const v = await unsign(parseCookies(request)[COOKIE], await secretOf(env));
  return !!v && Number(v) > Date.now();
}
function sameOrigin(request, url) {
  const src = request.headers.get('origin') || request.headers.get('referer');
  if (!src) return false;
  try { return new URL(src).host === url.host; } catch { return false; }
}

// ---------- Plantilla del panel ----------
function layout(c, title, body, active = '') {
  const nav = [
    ['panel', '/admin', 'Inicio'],
    ['eventos', '/admin/eventos', 'Eventos y galerías'],
    ['colaboradores', '/admin/colaboradores', 'Organizadores y colaboradores'],
    ['ajustes', '/admin/ajustes', 'Textos y contacto'],
    ['mensajes', '/admin/mensajes', 'Mensajes'],
  ];
  return html`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} · Gestión Perrufest</title>
<link rel="icon" href="/static/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/css/admin.css?v=${c.version}">
</head><body>
<header class="a-top">
  <a class="a-brand" href="/admin">Perrufest · Gestión</a>
  <nav class="a-nav">${nav.map(([k, href, label]) => html`<a href="${href}"${k === active ? raw(' aria-current="page"') : ''}>${label}${k === 'mensajes' && c.unread ? html` <b class="a-badge">${c.unread}</b>` : ''}</a>`)}
  <a href="/" target="_blank">Ver la web ↗</a>
  <form method="post" action="/admin/salir"><button class="a-link">Salir</button></form></nav>
</header>
<main class="a-main">${body}</main>
<script src="/static/js/admin.js?v=${c.version}" defer></script>
</body></html>`;
}

function field(label, name, value, { type = 'text', help = '', rows = 0, required = false, placeholder = '', attrs = '' } = {}) {
  const id = 'f-' + name;
  const req = required ? raw(' required') : '';
  const input = rows
    ? html`<textarea id="${id}" name="${name}" rows="${rows}" placeholder="${placeholder}"${req}${raw(attrs)}>${value ?? ''}</textarea>`
    : html`<input id="${id}" name="${name}" type="${type}" value="${value ?? ''}" placeholder="${placeholder}"${req}${raw(attrs)}>`;
  return html`<div class="a-field"><label for="${id}">${label}${required ? ' *' : ''}</label>${input}${help ? html`<small>${help}</small>` : ''}</div>`;
}
function uploadField(label, name, value, { kind = 'image', max = 2400, help = '', accept = 'image/jpeg,image/png,image/webp' } = {}) {
  const preview = value
    ? (kind === 'video' ? html`<video src="${fileUrl(value)}" controls preload="metadata"></video>` : html`<img src="${fileUrl(value)}" alt="">`)
    : html`<span class="a-empty">Sin ${kind === 'video' ? 'vídeo' : 'imagen'}</span>`;
  return html`<div class="a-field a-upl" data-upload="${kind}" data-max="${max}">
    <label>${label}</label>
    <input type="hidden" name="${name}" value="${value || ''}">
    <div class="a-upl-preview">${preview}</div>
    <div class="a-upl-actions">
      <label class="a-btn a-btn-sm">Elegir archivo<input type="file" accept="${accept}" hidden></label>
      <button type="button" class="a-btn a-btn-sm a-btn-ghost" data-clear ${value ? '' : raw('hidden')}>Quitar</button>
      <span class="a-upl-status" aria-live="polite"></span>
    </div>
    ${help ? html`<small>${help}</small>` : ''}
  </div>`;
}
const flash = (url) => {
  const ok = url.searchParams.get('ok');
  const msgs = { guardado: 'Cambios guardados.', creado: 'Creado correctamente.', borrado: 'Eliminado.' };
  return ok && msgs[ok] ? html`<p class="a-flash" role="status">${msgs[ok]}</p>` : '';
};

// ---------- Pantallas ----------
function loginPage(env, version, error = '') {
  return html`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Acceso · Gestión Perrufest</title><link rel="stylesheet" href="/static/css/admin.css?v=${version}"></head>
<body class="a-login"><form method="post" action="/admin/entrar" class="a-card">
<h1>Gestión de Perrufest</h1>
${env.ADMIN_PASSWORD ? '' : html`<p class="a-error">El acceso está desactivado: falta crear la contraseña (secreto ADMIN_PASSWORD) en Cloudflare.</p>`}
${error ? html`<p class="a-error" role="alert">${error}</p>` : ''}
<div class="a-field"><label for="pw">Contraseña</label><input id="pw" name="password" type="password" autocomplete="current-password" required autofocus></div>
<button class="a-btn a-btn-block">Entrar</button>
</form></body></html>`;
}

async function pendingItems(env) {
  const s = await data.getSettings(env.DB);
  const items = [];
  if (!s.logo) items.push(['Subir el logo completo de Perrufest', '/admin/ajustes#identidad']);
  if (!s.hero_image) items.push(['Subir la fotografía principal del inicio', '/admin/ajustes#identidad']);
  if (!s.contact_email) items.push(['Indicar el correo de contacto', '/admin/ajustes#contacto']);
  if (!s.whatsapp) items.push(['Indicar el número de WhatsApp', '/admin/ajustes#contacto']);
  if (!s.instagram) items.push(['Indicar la cuenta de Instagram', '/admin/ajustes#contacto']);
  if (!s.org_name || !s.org_nif || !s.org_address) items.push(['Completar los datos de la entidad organizadora (nombre, NIF, domicilio)', '/admin/ajustes#organizacion']);
  if (!(await data.organizers(env.DB)).length) items.push(['Añadir los organizadores (vuestras empresas)', '/admin/colaboradores?tipo=organizador#form']);
  if (/\[PENDIENTE/.test(s.legal_text)) items.push(['Revisar y completar el aviso legal (quitar las marcas [PENDIENTE])', '/admin/ajustes#legal']);
  if (/\[PENDIENTE/.test(s.privacy_text)) items.push(['Revisar y completar la política de privacidad (quitar las marcas [PENDIENTE])', '/admin/ajustes#legal']);
  if (!env.MEDIA_URL) items.push(['Recomendado: conectar el dominio de fotos (paso 6 de la guía) para que las galerías carguen más rápido y no consuman el límite gratuito', '']);
  if (!env.RESEND_API_KEY) items.push(['Opcional: activar el aviso por correo de nuevos mensajes. Mientras tanto, los mensajes se guardan aquí, en «Mensajes».', '']);
  for (const e of await data.listEvents(env.DB, true)) {
    if (e.isPast && !e.photoCount) items.push([`Subir las fotos de ${e.displayTitle}`, `/admin/eventos/${e.id}/fotos`]);
  }
  return items;
}

async function dashboard(c, env, url) {
  const items = await pendingItems(env);
  const msgs = await data.all(env.DB, 'SELECT * FROM messages ORDER BY id DESC LIMIT 5');
  const events = await data.listEvents(env.DB, true);
  return layout(c, 'Inicio', html`
${flash(url)}
<h1>Hola 👋</h1>
<div class="a-grid2">
  <section class="a-card">
    <h2>Pendiente antes de publicar</h2>
    ${items.length ? html`<ul class="a-todo">${items.map(([t, href]) => html`<li>${href ? html`<a href="${href}">${t}</a>` : t}</li>`)}</ul>` : html`<p>Todo listo ✅</p>`}
  </section>
  <section class="a-card">
    <h2>Accesos rápidos</h2>
    <p><a class="a-btn" href="/admin/eventos/nuevo">+ Nuevo evento</a></p>
    <ul class="a-list">${events.map((e) => html`<li><a href="/admin/eventos/${e.id}">${e.displayTitle}</a> <span class="a-muted">${e.dateLabel}</span> · <a href="/admin/eventos/${e.id}/fotos">Fotos (${e.photoCount})</a></li>`)}</ul>
  </section>
</div>
<section class="a-card">
  <h2>Últimos mensajes</h2>
  ${msgs.length ? html`<ul class="a-list">${msgs.map((m) => html`<li>${m.is_read ? '' : html`<b class="a-dot" title="Sin leer"></b>`} <strong>${m.name}</strong> · ${kindLabel(m.kind)} <span class="a-muted">${m.created_at}</span></li>`)}</ul><p><a href="/admin/mensajes">Ver todos</a></p>` : html`<p class="a-muted">Aún no hay mensajes.</p>`}
</section>`, 'panel');
}

async function eventsList(c, env, url) {
  const events = await data.listEvents(env.DB, true);
  return layout(c, 'Eventos', html`
${flash(url)}
<div class="a-head"><h1>Eventos y galerías</h1><a class="a-btn" href="/admin/eventos/nuevo">+ Nuevo evento</a></div>
<p class="a-muted">Cada evento es una edición del festival. Mientras su fecha no haya pasado aparece en «Próximos eventos»; después pasa automáticamente a la «Galería».</p>
<table class="a-table">
<thead><tr><th>Edición</th><th>Fechas</th><th>Estado</th><th>Fotos</th><th></th></tr></thead>
<tbody>${events.map((e) => html`<tr>
  <td><strong>${e.displayTitle}</strong>${e.venue ? html`<br><span class="a-muted">${e.venue}</span>` : ''}</td>
  <td>${e.dateLabel}</td>
  <td>${!e.published ? html`<span class="a-tag a-tag-draft">Borrador</span>` : e.isPast ? html`<span class="a-tag">Celebrado</span>` : html`<span class="a-tag a-tag-next">Próximo</span>`}</td>
  <td>${e.photoCount}</td>
  <td class="a-actions"><a class="a-btn a-btn-sm" href="/admin/eventos/${e.id}">Editar</a> <a class="a-btn a-btn-sm" href="/admin/eventos/${e.id}/fotos">Fotos</a></td>
</tr>`)}</tbody></table>`, 'eventos');
}

async function eventForm(c, env, e, url) {
  const isNew = !e.id;
  const partners = await data.all(env.DB, "SELECT * FROM partners WHERE kind != 'organizador' ORDER BY kind, sort, id");
  const linked = new Set(isNew ? [] : (await data.all(env.DB, 'SELECT partner_id FROM event_partners WHERE event_id = ?', e.id)).map((r) => r.partner_id));
  const videos = isNew ? [] : await data.videosOf(env.DB, e.id);
  return layout(c, isNew ? 'Nuevo evento' : e.displayTitle, html`
${flash(url)}
<div class="a-head"><h1>${isNew ? 'Nuevo evento' : e.displayTitle}</h1>
${isNew ? '' : html`<div><a class="a-btn a-btn-ghost" href="/eventos/${e.slug}" target="_blank">Ver ficha ↗</a> <a class="a-btn a-btn-ghost" href="/galeria/${e.slug}" target="_blank">Ver galería ↗</a> <a class="a-btn" href="/admin/eventos/${e.id}/fotos">Gestionar fotos (${e.photoCount})</a></div>`}</div>
<form method="post" class="a-form" action="${isNew ? '/admin/eventos/nuevo' : `/admin/eventos/${e.id}`}">
<section class="a-card">
  <h2>Dónde y cuándo</h2>
  <div class="a-grid2">
    ${field('Localidad', 'town', e.town, { required: true, placeholder: 'Ej.: San Martín de la Vega' })}
    ${field('Recinto', 'venue', e.venue, { placeholder: 'Ej.: nombre del parque o recinto ferial' })}
    ${field('Fecha de inicio', 'start_date', e.start_date, { type: 'date', help: 'Déjalo vacío si aún no hay fecha: se mostrará «Fechas por confirmar».' })}
    ${field('Fecha de fin', 'end_date', e.end_date, { type: 'date', help: 'Igual que la de inicio si dura un día.' })}
  </div>
  ${field('Texto de fechas (opcional)', 'date_text', e.date_text, { help: e.start_date ? `Si lo dejas vacío se mostrará: «${formatRange(e.start_date, e.end_date)}».` : 'Si lo dejas vacío se genera a partir de las fechas.' })}
  ${field('Horarios', 'schedule', e.schedule, { rows: 3, placeholder: 'Sábado: 10:00 a 20:00\nDomingo: 10:00 a 14:00' })}
  ${field('Dirección', 'address', e.address, { help: 'Se usa para el botón «Cómo llegar».', placeholder: 'Calle, número, localidad' })}
  ${field('Enlace de mapa (opcional)', 'maps_url', e.maps_url, { type: 'url', help: 'Si lo rellenas, «Cómo llegar» abrirá este enlace en lugar de buscar la dirección.' })}
</section>
<section class="a-card">
  <h2>Cartel, programa y condiciones</h2>
  ${uploadField('Cartel', 'poster', e.poster, { max: 2400, help: 'JPG o PNG. Se reduce automáticamente si es muy grande.' })}
  ${field('Programa de actividades', 'program', e.program, { rows: 8, help: 'Una actividad por línea. Empieza con la hora si la tiene («11:30 Exhibición de agility»). Usa «# Sábado 26» para separar por días.' })}
  ${field('Condiciones de acceso', 'access', e.access, { rows: 3, help: 'Ej.: perros con correa, documentación… (solo si corresponde).' })}
  ${field('Precios', 'prices', e.prices, { rows: 2, help: 'Déjalo vacío si la entrada es libre o no aplica.' })}
</section>
<section class="a-card">
  <h2>Galería</h2>
  ${field('Título (opcional)', 'title', e.title, { help: 'Por defecto se muestra el nombre de la localidad.' })}
  ${field('Descripción breve', 'description', e.description, { rows: 3, help: 'Aparece al principio de la galería de fotos.' })}
  ${field('Dirección de la página', 'slug', e.slug, { help: 'Se genera sola a partir de la localidad y el año. Cámbiala solo si sabes lo que haces: los enlaces ya compartidos dejarían de funcionar.', attrs: ' pattern="[a-z0-9\\-]*"' })}
</section>
<section class="a-card">
  <h2>Ayuntamiento, patrocinadores y colaboradores de esta edición</h2>
  ${partners.length ? html`<div class="a-checks">${partners.map((p) => html`<label><input type="checkbox" name="partners[]" value="${p.id}"${linked.has(p.id) ? raw(' checked') : ''}> ${p.name} <span class="a-muted">(${kindName(p.kind)})</span></label>`)}</div>`
    : html`<p class="a-muted">Aún no hay ninguno. <a href="/admin/colaboradores">Añádelos aquí</a> y luego márcalos en cada edición. Los organizadores no hace falta marcarlos: salen siempre.</p>`}
</section>
<section class="a-card">
  <label class="a-switch"><input type="checkbox" name="published" value="1"${e.published || isNew ? raw(' checked') : ''}> Publicado (visible en la web)</label>
  <p class="a-muted">Si lo desmarcas, el evento queda como borrador y no aparece en la web.</p>
</section>
<div class="a-sticky"><button class="a-btn a-btn-lg">${isNew ? 'Crear evento' : 'Guardar cambios'}</button></div>
</form>

${isNew ? '' : html`
<section class="a-card" id="videos">
  <h2>Vídeos</h2>
  ${videos.length ? html`<ul class="a-list">${videos.map((v) => html`<li>${v.title || '(sin título)'} — <span class="a-muted">${v.url || 'archivo subido'}</span>
    <form method="post" action="/admin/videos/${v.id}/borrar" class="a-inline" data-confirm="¿Quitar este vídeo?"><button class="a-link a-danger">Quitar</button></form></li>`)}</ul>` : html`<p class="a-muted">Sin vídeos.</p>`}
  <form method="post" action="/admin/eventos/${e.id}/videos" class="a-form a-subform">
    <h3>Añadir vídeo</h3>
    ${field('Título', 'title', '', { placeholder: 'Vídeo resumen' })}
    ${field('Enlace de YouTube o Vimeo (recomendado)', 'url', '', { type: 'url', placeholder: 'https://youtu.be/…' })}
    <p class="a-muted">…o sube el archivo MP4 (máximo 95 MB; para vídeos más largos, súbelo a YouTube y pega el enlace):</p>
    ${uploadField('Archivo de vídeo', 'file', '', { kind: 'video', accept: 'video/mp4,video/quicktime,video/webm' })}
    <button class="a-btn">Añadir vídeo</button>
  </form>
</section>
<section class="a-card a-dangerzone">
  <h2>Eliminar evento</h2>
  <p>Se borrarán también todas sus fotos y vídeos subidos. No se puede deshacer.</p>
  <form method="post" action="/admin/eventos/${e.id}/borrar" data-confirm="¿Seguro que quieres eliminar ${e.displayTitle} y todas sus fotos?"><button class="a-btn a-btn-danger">Eliminar evento</button></form>
</section>`}`, 'eventos');
}

async function photosPage(c, env, e) {
  const photos = await data.photosOf(env.DB, e.id);
  const groups = [...new Set(photos.map((p) => p.grp).filter(Boolean))];
  return layout(c, `Fotos · ${e.displayTitle}`, html`
<div class="a-head"><h1>Fotos · ${e.displayTitle}</h1><div><a class="a-btn a-btn-ghost" href="/admin/eventos/${e.id}">← Datos del evento</a> <a class="a-btn a-btn-ghost" href="/galeria/${e.slug}" target="_blank">Ver galería ↗</a></div></div>
<section class="a-card" id="uploader" data-event="${e.id}" data-maxsort="${photos.reduce((m, p) => Math.max(m, p.sort || 0), 0)}">
  <h2>Subir fotos</h2>
  <div class="a-grid2">
    <div class="a-field"><label for="up-grp">Grupo (opcional)</label>
      <input id="up-grp" list="grp-list" placeholder="Ej.: Sábado 26, Domingo 27, Exhibiciones…">
      <datalist id="grp-list">${groups.map((g) => html`<option value="${g}">`)}</datalist>
      <small>Sirve para que los visitantes filtren por día o actividad. Puedes cambiarlo después.</small></div>
    <div class="a-drop" id="drop">
      <p><strong>Arrastra aquí las fotos</strong> o</p>
      <label class="a-btn">Elegir fotos<input type="file" id="files" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple hidden></label>
      <small>Se suben en el orden del nombre de archivo. Se crean automáticamente la miniatura, la versión para ver y la versión de descarga (sin datos de ubicación).</small>
    </div>
  </div>
  <div id="up-progress" class="a-progress" hidden><div class="a-bar"><span id="up-bar"></span></div><p id="up-text" aria-live="polite"></p><ul id="up-errors" class="a-errors"></ul></div>
</section>
<section class="a-card">
  <div class="a-head"><h2>${photos.length} fotos</h2>
    <p class="a-muted">Marca fotos para actuar sobre ellas. En ordenador puedes arrastrarlas para cambiar el orden.</p></div>
  ${photos.length ? html`
  <div class="a-toolbar" id="toolbar">
    <label><input type="checkbox" id="sel-all"> Todas</label>
    <span id="sel-count" class="a-muted">0 seleccionadas</span>
    <span class="a-tb-group">
      <input id="tb-grp" list="grp-list" placeholder="Grupo">
      <button class="a-btn a-btn-sm" data-act="grupo">Asignar grupo</button>
    </span>
    <button class="a-btn a-btn-sm" data-act="principio">Mover al principio</button>
    <button class="a-btn a-btn-sm" data-act="final">Mover al final</button>
    <button class="a-btn a-btn-sm" data-act="portada">Usar como portada</button>
    <button class="a-btn a-btn-sm a-btn-danger" data-act="borrar">Borrar</button>
  </div>
  <ul class="a-photos" id="photos" data-event="${e.id}">
    ${photos.map((p) => html`<li draggable="true" data-id="${p.id}">
      <label><input type="checkbox" value="${p.id}"><img src="${photoUrl(p, 't')}" alt="" loading="lazy"></label>
      ${e.cover && e.cover.id === p.id ? html`<span class="a-cover">Portada</span>` : ''}
      ${p.grp ? html`<span class="a-grp">${p.grp}</span>` : ''}
    </li>`)}
  </ul>` : html`<p class="a-muted">Todavía no hay fotos en esta edición.</p>`}
</section>`, 'eventos');
}

const KIND_LIST = [
  ['organizador', 'Organizador', 'Organizadores', 'Vuestras empresas. Aparecen siempre, en toda la web.'],
  ['ayuntamiento', 'Ayuntamiento', 'Ayuntamientos', 'El de la localidad de cada edición.'],
  ['patrocinador', 'Patrocinador', 'Patrocinadores', 'Quien aporta dinero o recursos a una edición.'],
  ['colaborador', 'Colaborador', 'Colaboradores', 'Exhibiciones, actividades y demás participantes, con su Instagram o web.'],
];
const kindName = (k) => (KIND_LIST.find(([x]) => x === k) || [k, k])[1];

async function partnersPage(c, env, url, edit) {
  const partners = await data.allPartners(env.DB);
  const events = await data.listEvents(env.DB, true);
  const preset = KIND_LIST.some(([k]) => k === url.searchParams.get('tipo')) ? url.searchParams.get('tipo') : 'colaborador';
  const p = edit || { name: '', kind: preset, url: '', logo: '' };
  const linked = new Set(edit ? (await data.all(env.DB, 'SELECT event_id FROM event_partners WHERE partner_id = ?', edit.id)).map((r) => r.event_id) : []);
  return layout(c, 'Organizadores y colaboradores', html`
${flash(url)}
<h1>Organizadores, ayuntamientos, patrocinadores y colaboradores</h1>
<p class="a-muted">Los <strong>organizadores</strong> salen siempre. Los ayuntamientos, patrocinadores y colaboradores salen en las ediciones que marques (en su ficha y en el inicio cuando es la edición actual). Si pones su Instagram o web, al pulsar su logo se abre directamente.</p>
<div class="a-grid2">
<section class="a-card" id="form">
  <h2>${edit ? `Editar: ${edit.name}` : 'Añadir'}</h2>
  <form method="post" class="a-form" action="${edit ? `/admin/colaboradores/${edit.id}` : '/admin/colaboradores'}">
    <div class="a-field"><label for="f-kind">Tipo</label><select id="f-kind" name="kind">
      ${KIND_LIST.map(([k, l, , help]) => html`<option value="${k}"${p.kind === k ? raw(' selected') : ''}>${l} — ${help}</option>`)}
    </select></div>
    ${field('Nombre', 'name', p.name, { required: true })}
    ${field('Instagram o web (opcional)', 'url', p.url, { placeholder: '@usuario o https://…', help: 'Puedes poner solo el usuario de Instagram (@usuario) o un enlace completo.' })}
    ${uploadField('Logo', 'logo', p.logo, { max: 800, help: 'Mejor PNG con fondo transparente. Si no hay logo, se muestra el nombre.' })}
    <div class="a-field" id="ed-checks"${p.kind === 'organizador' ? raw(' hidden') : ''}><label>Ediciones en las que participa</label><div class="a-checks">
      ${events.map((e) => html`<label><input type="checkbox" name="events[]" value="${e.id}"${linked.has(e.id) ? raw(' checked') : ''}> ${e.displayTitle} <span class="a-muted">${e.dateLabel}</span></label>`)}
    </div></div>
    <button class="a-btn">${edit ? 'Guardar' : 'Añadir'}</button> ${edit ? html`<a href="/admin/colaboradores">Cancelar</a>` : ''}
  </form>
</section>
<div>
${KIND_LIST.map(([k, , many]) => {
  const g = partners.filter((x) => (x.kind || 'colaborador') === k);
  return html`<section class="a-card">
  <div class="a-head"><h2>${many} (${g.length})</h2><a class="a-btn a-btn-sm a-btn-ghost" href="/admin/colaboradores?tipo=${k}#form">+ Añadir</a></div>
  ${g.length ? html`<ul class="a-partners">${g.map((x) => html`<li>
    ${x.logo ? html`<img src="${fileUrl(x.logo)}" alt="">` : html`<span class="a-empty">Sin logo</span>`}
    <div><strong>${x.name}</strong>${x.url ? html`<br><span class="a-muted">${x.url}</span>` : ''}<br><span class="a-muted">${k === 'organizador' ? 'Siempre visible' : x.events.map((e) => e.town).join(', ') || 'Sin ediciones marcadas'}</span></div>
    <div class="a-actions"><a class="a-btn a-btn-sm" href="/admin/colaboradores/${x.id}">Editar</a>
    <form method="post" action="/admin/colaboradores/${x.id}/borrar" class="a-inline" data-confirm="¿Eliminar ${x.name}?"><button class="a-btn a-btn-sm a-btn-danger">Borrar</button></form></div>
  </li>`)}</ul>` : html`<p class="a-muted">Ninguno todavía.</p>`}
</section>`;
})}
</div>
</div>`, 'colaboradores');
}

async function settingsPage(c, env, url) {
  const s = await data.getSettings(env.DB);
  const feats = [...s.featuresList];
  while (feats.length < 6) feats.push({ icon: 'paw', title: '', text: '' });
  const events = await data.listEvents(env.DB, true);
  const ICON_LABEL = { dog: 'Perro', family: 'Familia', stall: 'Puesto', heart: 'Corazón', paw: 'Huella', star: 'Estrella', ball: 'Pelota' };
  return layout(c, 'Textos y contacto', html`
${flash(url)}
<h1>Textos y contacto</h1>
<form method="post" class="a-form" action="/admin/ajustes">
<section class="a-card" id="identidad">
  <h2>Identidad</h2>
  <div class="a-grid2">
    ${uploadField('Logo completo', 'logo', s.logo, { max: 2000, help: 'Se muestra entero, sin recortar, en el inicio.' })}
    ${uploadField('Fotografía principal del inicio', 'hero_image', s.hero_image, { max: 2000, help: 'Una buena foto horizontal o cuadrada del festival.' })}
  </div>
  <div class="a-grid3">
    ${field('Color principal', 'color_primary', s.color_primary, { type: 'color', help: 'Botones y destacados (rosa del logo).' })}
    ${field('Color secundario', 'color_secondary', s.color_secondary, { type: 'color', help: 'Títulos, cabecera y pie (azul noche del logo).' })}
    ${field('Color de acento', 'color_accent', s.color_accent, { type: 'color', help: 'Detalles (verde lima del logo).' })}
  </div>
  <div class="a-grid2">
    ${field('Nombre', 'site_name', s.site_name, { required: true })}
    ${field('Subtítulo', 'site_tagline', s.site_tagline)}
  </div>
</section>
<section class="a-card">
  <h2>Inicio</h2>
  ${field('Título de presentación', 'intro_title', s.intro_title)}
  ${field('Presentación breve', 'intro_text', s.intro_text, { rows: 3 })}
  <div class="a-field"><label for="f-featured">Galería destacada en el inicio</label><select id="f-featured" name="featured_event_id">
    <option value="">Automática (la última edición celebrada)</option>
    ${events.map((e) => html`<option value="${e.id}"${String(e.id) === String(s.featured_event_id) ? raw(' selected') : ''}>${e.displayTitle} · ${e.dateLabel}</option>`)}
  </select></div>
  <h3>Qué encontrarás (propuestas del festival)</h3>
  <p class="a-muted">Hasta 6 bloques. Los que dejes sin título no se muestran.</p>
  <div class="a-feats">${feats.slice(0, 6).map((f, i) => html`<fieldset class="a-feat"><legend>Bloque ${i + 1}</legend>
    <div class="a-field"><label for="fi-${i}">Icono</label><select id="fi-${i}" name="feat_icon_${i}">${ICON_NAMES.map((n) => html`<option value="${n}"${f.icon === n ? raw(' selected') : ''}>${ICON_LABEL[n]}</option>`)}</select></div>
    ${field('Título', `feat_title_${i}`, f.title)}
    ${field('Texto', `feat_text_${i}`, f.text, { rows: 2 })}
  </fieldset>`)}</div>
</section>
<section class="a-card">
  <h2>Mensajes de las secciones</h2>
  ${field('Texto cuando no hay próximos eventos', 'upcoming_empty', s.upcoming_empty, { rows: 2 })}
  ${field('Texto de «Participa»', 'participate_text', s.participate_text, { rows: 2 })}
</section>
<section class="a-card" id="contacto">
  <h2>Contacto y redes</h2>
  <div class="a-grid3">
    ${field('Correo de contacto', 'contact_email', s.contact_email, { type: 'email' })}
    ${field('WhatsApp', 'whatsapp', s.whatsapp, { type: 'tel', placeholder: '600 000 000', help: 'Número con o sin +34.' })}
    ${field('Instagram', 'instagram', s.instagram, { placeholder: '@perrufest', help: 'Usuario o enlace completo.' })}
  </div>
  ${field('Correo donde recibir avisos de nuevos mensajes', 'notify_email', s.notify_email, { type: 'email', help: env.RESEND_API_KEY ? 'Aviso por correo activo. Si lo dejas vacío se usa el correo de contacto.' : 'El aviso por correo aún no está activado. Los mensajes se guardan igualmente en «Mensajes».' })}
</section>
<section class="a-card" id="organizacion">
  <h2>Entidad organizadora (pie de página y textos legales)</h2>
  <div class="a-grid2">
    ${field('Nombre o razón social', 'org_name', s.org_name)}
    ${field('NIF / CIF', 'org_nif', s.org_nif)}
    ${field('Domicilio', 'org_address', s.org_address)}
    ${field('Correo de la entidad', 'org_email', s.org_email, { type: 'email' })}
  </div>
</section>
<section class="a-card" id="legal">
  <h2>Aviso legal y privacidad</h2>
  <p class="a-warn">Son borradores orientativos: deben revisarse y adaptarse a la entidad y al funcionamiento real antes de publicar. Quita las marcas [PENDIENTE] cuando estén completos. Los textos {org_name}, {org_nif}, {org_address} y {org_email} se sustituyen por los datos de la entidad.</p>
  <p class="a-muted">Formato: deja una línea en blanco entre párrafos, «## » al principio para un título, «- » para listas y **texto** para negrita.</p>
  ${field('Aviso legal', 'legal_text', s.legal_text, { rows: 14 })}
  ${field('Política de privacidad', 'privacy_text', s.privacy_text, { rows: 18 })}
</section>
<div class="a-sticky"><button class="a-btn a-btn-lg">Guardar cambios</button></div>
</form>`, 'ajustes');
}

async function messagesPage(c, env, url) {
  const allMsgs = url.searchParams.get('ver') === 'todos';
  const msgs = await data.all(env.DB, `SELECT * FROM messages ${allMsgs ? '' : 'WHERE is_read = 0'} ORDER BY id DESC LIMIT 500`);
  return layout(c, 'Mensajes', html`
${flash(url)}
<div class="a-head"><h1>Mensajes</h1>
<p>${!allMsgs ? html`<strong>Sin leer</strong> · <a href="/admin/mensajes?ver=todos">Ver todos</a>` : html`<a href="/admin/mensajes">Sin leer</a> · <strong>Todos</strong>`}</p></div>
${msgs.length ? msgs.map((m) => html`<article class="a-card a-msg${m.is_read ? '' : ' a-unread'}">
  <header><strong>${m.name}</strong>${m.entity ? html` · ${m.entity}` : ''} <span class="a-tag">${kindLabel(m.kind)}</span> <span class="a-muted">${m.created_at} (UTC)</span></header>
  <p><a href="mailto:${m.email}?subject=${encodeURIComponent('Re: Perrufest')}">${m.email}</a>${m.phone ? html` · <a href="tel:${m.phone.replace(/\s/g, '')}">${m.phone}</a>` : ''}</p>
  <p class="a-msg-text">${m.message}</p>
  ${m.notify_error ? html`<p class="a-warn">No se pudo enviar el aviso por correo: ${m.notify_error}</p>` : ''}
  <footer class="a-actions">
    <form method="post" action="/admin/mensajes/${m.id}/leido" class="a-inline"><button class="a-btn a-btn-sm">${m.is_read ? 'Marcar como no leído' : 'Marcar como leído'}</button></form>
    <form method="post" action="/admin/mensajes/${m.id}/borrar" class="a-inline" data-confirm="¿Borrar este mensaje?"><button class="a-btn a-btn-sm a-btn-danger">Borrar</button></form>
  </footer>
</article>`) : html`<p class="a-muted">No hay mensajes ${allMsgs ? '' : 'sin leer'}.</p>`}`, 'mensajes');
}

// ---------- Acciones ----------
const TEXT_KEYS = ['site_name', 'site_tagline', 'logo', 'hero_image', 'color_primary', 'color_secondary', 'color_accent', 'intro_title', 'intro_text',
  'upcoming_empty', 'participate_text', 'contact_email', 'whatsapp', 'instagram', 'notify_email', 'featured_event_id',
  'org_name', 'org_nif', 'org_address', 'org_email', 'legal_text', 'privacy_text'];
const isFilePath = (v) => !v || v === DEFAULT_LOGO || /^files\/[\w-]+\.(jpg|png|webp|mp4|mov|webm)$/.test(v);
const isColor = (v) => /^#[0-9a-fA-F]{6}$/.test(v);
const IMMUTABLE = 'public, max-age=31536000, immutable';

async function uniqueSlug(db, base, exceptId = 0) {
  let slug = base || 'evento'; let i = 2;
  while (await data.one(db, 'SELECT 1 AS x FROM events WHERE slug = ? AND id != ?', slug, exceptId)) slug = `${base}-${i++}`;
  return slug;
}

async function saveEvent(db, f, id) {
  const clean = (k, n = 4000) => String(f[k] ?? '').trim().slice(0, n);
  const date = (k) => (/^\d{4}-\d{2}-\d{2}$/.test(f[k] || '') ? f[k] : null);
  const town = clean('town', 120);
  if (!town) throw Object.assign(new Error('La localidad es obligatoria'), { status: 400 });
  let start = date('start_date'); let end = date('end_date');
  if (start && !end) end = start;
  if (!start && end) start = end;
  if (start && end && end < start) [start, end] = [end, start];
  const poster = clean('poster', 200);
  const mapsUrl = clean('maps_url', 600);
  const slugBase = slugify(clean('slug', 80)) || slugify(`${town}${start ? '-' + start.slice(0, 4) : ''}`);
  const row = {
    town, venue: clean('venue', 200), title: clean('title', 200), start_date: start, end_date: end, date_text: clean('date_text', 200),
    schedule: clean('schedule'), poster: isFilePath(poster) ? poster : '', program: clean('program', 10000), access: clean('access'), prices: clean('prices'),
    address: clean('address', 300), maps_url: /^https?:\/\//.test(mapsUrl) ? mapsUrl : '',
    description: clean('description'), published: f.published ? 1 : 0, slug: await uniqueSlug(db, slugBase, id || 0),
  };
  const cols = Object.keys(row);
  if (id) await db.prepare(`UPDATE events SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).bind(...Object.values(row), id).run();
  else id = Number((await db.prepare(`INSERT INTO events (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...Object.values(row)).run()).meta.last_row_id);
  const stmts = [db.prepare('DELETE FROM event_partners WHERE event_id = ?').bind(id)];
  for (const pid of [].concat(f.partners || [])) stmts.push(db.prepare('INSERT OR IGNORE INTO event_partners (event_id, partner_id) VALUES (?, ?)').bind(id, Number(pid)));
  await db.batch(stmts);
  return id;
}

async function removeFile(env, rel) {
  if (rel && rel !== DEFAULT_LOGO && isFilePath(rel)) await env.MEDIA.delete(rel);
}
const photoKeys = (p) => ['t', 'm', 'o'].map((s) => `photos/${p.event_id}/${p.file}-${s}.jpg`);

async function uploadFile(request, env, url, h) {
  const kind = url.searchParams.get('tipo') === 'video' ? 'video' : 'image';
  if (kind === 'video') {
    const type = (request.headers.get('x-file-type') || '').toLowerCase();
    const ext = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' }[type];
    if (!ext) return h.json({ ok: false, error: 'Formato de vídeo no admitido (usa MP4).' }, 400);
    const len = Number(request.headers.get('content-length') || 0);
    if (len > 95 * 1024 * 1024) return h.json({ ok: false, error: 'El vídeo supera 95 MB. Súbelo a YouTube y pega el enlace.' }, 413);
    const rel = `files/${uid()}.${ext}`;
    await env.MEDIA.put(rel, request.body, { httpMetadata: { contentType: type, cacheControl: IMMUTABLE } });
    return h.json({ ok: true, path: rel, url: fileUrl(rel) });
  }
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.length > 20e6) return h.json({ ok: false, error: 'Imagen demasiado grande.' }, 413);
  const ext = sniffImage(buf);
  if (!ext) return h.json({ ok: false, error: 'Formato de imagen no admitido (usa JPG o PNG).' }, 400);
  const rel = `files/${uid()}.${ext}`;
  await env.MEDIA.put(rel, buf, { httpMetadata: { contentType: { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext], cacheControl: IMMUTABLE } });
  return h.json({ ok: true, path: rel, url: fileUrl(rel) });
}

async function uploadPhoto(request, env, url, h, eventId) {
  if (!await data.one(env.DB, 'SELECT 1 AS x FROM events WHERE id = ?', eventId)) return h.json({ ok: false, error: 'Evento no encontrado' }, 404);
  const q = (k) => Number(url.searchParams.get(k));
  const lens = [q('lt'), q('lm'), q('lo')];
  if (lens.some((n) => !Number.isInteger(n) || n <= 0)) return h.json({ ok: false, error: 'Datos incompletos' }, 400);
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.length !== lens[0] + lens[1] + lens[2]) return h.json({ ok: false, error: 'Subida incompleta, vuelve a intentarlo' }, 400);
  const partsArr = []; let off = 0;
  for (const n of lens) { partsArr.push(buf.subarray(off, off + n)); off += n; }
  if (partsArr.some((p) => sniffImage(p) !== 'jpg')) return h.json({ ok: false, error: 'Imagen no válida' }, 400);
  const p = { event_id: eventId, file: uid() };
  const keys = photoKeys(p);
  await Promise.all(keys.map((k, i) => env.MEDIA.put(k, partsArr[i], { httpMetadata: { contentType: 'image/jpeg', cacheControl: IMMUTABLE } })));
  const max = (await data.one(env.DB, 'SELECT MAX(sort) AS m FROM photos WHERE event_id = ?', eventId))?.m ?? 0;
  const sort = Number.isInteger(q('sort')) && q('sort') > 0 ? q('sort') : max + 1; // orden del lote, aunque se suban en paralelo
  const grp = String(url.searchParams.get('grp') || '').trim().slice(0, 60);
  const r = await env.DB.prepare('INSERT INTO photos (event_id, file, w, h, grp, sort) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(eventId, p.file, q('w') || null, q('h') || null, grp, sort).run();
  return h.json({ ok: true, id: Number(r.meta.last_row_id) });
}

async function photoAction(env, body) {
  const db = env.DB;
  const eventId = Number(body.event);
  const ids = [].concat(body.ids || []).map(Number).filter(Boolean);
  const all = await data.photosOf(db, eventId);
  const sel = new Set(ids.filter((id) => all.some((p) => p.id === id)));
  const photos = all.filter((p) => sel.has(p.id));
  const reorder = (orderedIds) => db.batch(orderedIds.map((id, i) => db.prepare('UPDATE photos SET sort = ? WHERE id = ? AND event_id = ?').bind(i + 1, id, eventId)));
  switch (body.action) {
    case 'orden': {
      const given = ids.filter((id) => all.some((p) => p.id === id));
      await reorder([...given, ...all.map((p) => p.id).filter((id) => !given.includes(id))]); break;
    }
    case 'principio': await reorder([...photos, ...all.filter((p) => !sel.has(p.id))].map((p) => p.id)); break;
    case 'final': await reorder([...all.filter((p) => !sel.has(p.id)), ...photos].map((p) => p.id)); break;
    case 'grupo':
      if (photos.length) await db.batch(photos.map((p) => db.prepare('UPDATE photos SET grp = ? WHERE id = ?').bind(String(body.grp || '').trim().slice(0, 60), p.id)));
      break;
    case 'portada': if (photos[0]) await db.prepare('UPDATE events SET cover_photo_id = ? WHERE id = ?').bind(photos[0].id, eventId).run(); break;
    case 'borrar':
      if (!photos.length) break;
      await db.batch([
        ...photos.map((p) => db.prepare('DELETE FROM photos WHERE id = ?').bind(p.id)),
        db.prepare('UPDATE events SET cover_photo_id = NULL WHERE id = ? AND cover_photo_id NOT IN (SELECT id FROM photos)').bind(eventId),
      ]);
      await env.MEDIA.delete(photos.flatMap(photoKeys));
      break;
    default: return { ok: false, error: 'Acción desconocida' };
  }
  return { ok: true };
}

async function deletePrefix(env, prefix) {
  let cursor;
  do {
    const list = await env.MEDIA.list({ prefix, cursor, limit: 1000 });
    if (list.objects.length) await env.MEDIA.delete(list.objects.map((o) => o.key));
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
}

// ---------- Enrutador del panel ----------
export async function handleAdmin(request, env, url, h) {
  const db = env.DB;
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const post = request.method === 'POST';
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const version = h.version;
  let r;

  if (post && !sameOrigin(request, url)) return h.text('Petición no permitida', 403);

  if (p === '/admin/entrar' && post) {
    const now = Date.now();
    const list = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60e3);
    if (list.length >= 8) return h.page(loginPage(env, version, 'Demasiados intentos. Espera 15 minutos.'), 429);
    const f = await readForm(request);
    if (!env.ADMIN_PASSWORD || !(await safeEqual(f.password || '', env.ADMIN_PASSWORD))) {
      list.push(now); attempts.set(ip, list);
      return h.page(loginPage(env, version, 'Contraseña incorrecta.'), 401);
    }
    attempts.delete(ip);
    const cookie = await sign(String(now + 30 * 864e5), await secretOf(env));
    const secure = url.protocol === 'https:' ? '; Secure' : '';
    return h.redirect('/admin', { 'Set-Cookie': `${COOKIE}=${encodeURIComponent(cookie)}; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure}` });
  }
  if (!(await isLogged(request, env))) {
    if (p.startsWith('/admin/api/')) return h.json({ ok: false, error: 'La sesión ha caducado. Vuelve a entrar.' }, 401);
    return h.page(loginPage(env, version), p === '/admin' ? 200 : 401);
  }
  if (p === '/admin/salir' && post) {
    return h.redirect('/admin', { 'Set-Cookie': `${COOKIE}=; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=0` });
  }

  // API (JSON / subida de archivos)
  if (post && p === '/admin/api/subir') return uploadFile(request, env, url, h);
  if (post && (r = p.match(/^\/admin\/api\/eventos\/(\d+)\/fotos$/))) return uploadPhoto(request, env, url, h, Number(r[1]));
  if (post && p === '/admin/api/fotos') return h.json(await photoAction(env, await readForm(request)));

  const c = { version, unread: (await data.one(db, 'SELECT COUNT(*) AS n FROM messages WHERE is_read = 0')).n };

  // Pantallas
  if (p === '/admin') return h.page(await dashboard(c, env, url));
  if (p === '/admin/eventos') return h.page(await eventsList(c, env, url));
  if (p === '/admin/eventos/nuevo') {
    if (post) { const id = await saveEvent(db, await readForm(request)); return h.redirect(`/admin/eventos/${id}?ok=creado`); }
    return h.page(await eventForm(c, env, { published: 1 }, url));
  }
  if ((r = p.match(/^\/admin\/eventos\/(\d+)(?:\/(fotos|borrar|videos))?$/))) {
    const e = await data.getEvent(db, Number(r[1]));
    if (!e) return h.redirect('/admin/eventos');
    if (r[2] === 'fotos') return h.page(await photosPage(c, env, e));
    if (r[2] === 'borrar' && post) {
      const videos = await data.videosOf(db, e.id);
      await db.prepare('DELETE FROM events WHERE id = ?').bind(e.id).run();
      await deletePrefix(env, `photos/${e.id}/`);
      for (const v of videos) await removeFile(env, v.file);
      return h.redirect('/admin/eventos?ok=borrado');
    }
    if (r[2] === 'videos' && post) {
      const f = await readForm(request);
      const vurl = /^https?:\/\//.test(f.url || '') ? String(f.url).slice(0, 500) : '';
      const file = f.file && isFilePath(f.file) ? f.file : '';
      if (vurl || file) await db.prepare('INSERT INTO videos (event_id, title, url, file) VALUES (?, ?, ?, ?)').bind(e.id, String(f.title || '').slice(0, 200), file ? '' : vurl, file).run();
      return h.redirect(`/admin/eventos/${e.id}?ok=guardado#videos`);
    }
    if (post) { await saveEvent(db, await readForm(request), e.id); return h.redirect(`/admin/eventos/${e.id}?ok=guardado`); }
    return h.page(await eventForm(c, env, e, url));
  }
  if ((r = p.match(/^\/admin\/videos\/(\d+)\/borrar$/)) && post) {
    const v = await data.one(db, 'SELECT * FROM videos WHERE id = ?', Number(r[1]));
    if (v) { await db.prepare('DELETE FROM videos WHERE id = ?').bind(v.id).run(); await removeFile(env, v.file); }
    return h.redirect(v ? `/admin/eventos/${v.event_id}?ok=borrado#videos` : '/admin/eventos');
  }
  if ((r = p.match(/^\/admin\/colaboradores(?:\/(\d+))?(?:\/(borrar))?$/))) {
    const id = r[1] ? Number(r[1]) : 0;
    const existing = id ? await data.one(db, 'SELECT * FROM partners WHERE id = ?', id) : null;
    if (id && !existing) return h.redirect('/admin/colaboradores');
    if (post && r[2] === 'borrar') {
      await db.prepare('DELETE FROM partners WHERE id = ?').bind(id).run();
      await removeFile(env, existing.logo);
      return h.redirect('/admin/colaboradores?ok=borrado');
    }
    if (post) {
      const f = await readForm(request);
      const name = String(f.name || '').trim().slice(0, 160);
      if (!name) return h.redirect('/admin/colaboradores');
      const kind = KIND_LIST.some(([k]) => k === f.kind) ? f.kind : 'colaborador';
      const rawUrl = String(f.url || '').trim().slice(0, 500);
      const purl = partnerUrl(rawUrl) ? rawUrl : '';
      const logo = isFilePath(f.logo) ? f.logo || '' : '';
      let pid = id;
      if (id) await db.prepare('UPDATE partners SET name = ?, kind = ?, url = ?, logo = ? WHERE id = ?').bind(name, kind, purl, logo, id).run();
      else pid = Number((await db.prepare('INSERT INTO partners (name, kind, url, logo) VALUES (?, ?, ?, ?)').bind(name, kind, purl, logo).run()).meta.last_row_id);
      const stmts = [db.prepare('DELETE FROM event_partners WHERE partner_id = ?').bind(pid)];
      for (const eid of kind === 'organizador' ? [] : [].concat(f.events || [])) stmts.push(db.prepare('INSERT OR IGNORE INTO event_partners (event_id, partner_id) VALUES (?, ?)').bind(Number(eid), pid));
      await db.batch(stmts);
      return h.redirect(`/admin/colaboradores?ok=${id ? 'guardado' : 'creado'}`);
    }
    return h.page(await partnersPage(c, env, url, existing));
  }
  if (p === '/admin/ajustes') {
    if (post) {
      const f = await readForm(request);
      const out = {};
      for (const k of TEXT_KEYS) if (k in f) out[k] = String(f[k]).trim().slice(0, 20000);
      for (const k of ['logo', 'hero_image']) if (!isFilePath(out[k])) delete out[k];
      for (const k of ['color_primary', 'color_secondary', 'color_accent']) if (out[k] && !isColor(out[k])) delete out[k];
      if (!out.site_name) delete out.site_name;
      out.features = JSON.stringify([0, 1, 2, 3, 4, 5].map((i) => ({
        icon: ICON_NAMES.includes(f[`feat_icon_${i}`]) ? f[`feat_icon_${i}`] : 'paw',
        title: String(f[`feat_title_${i}`] || '').trim().slice(0, 80),
        text: String(f[`feat_text_${i}`] || '').trim().slice(0, 300),
      })).filter((x) => x.title));
      await data.setSettings(db, out);
      return h.redirect('/admin/ajustes?ok=guardado');
    }
    return h.page(await settingsPage(c, env, url));
  }
  if (p === '/admin/mensajes') return h.page(await messagesPage(c, env, url));
  if ((r = p.match(/^\/admin\/mensajes\/(\d+)\/(leido|borrar)$/)) && post) {
    if (r[2] === 'leido') await db.prepare('UPDATE messages SET is_read = 1 - is_read WHERE id = ?').bind(Number(r[1])).run();
    else await db.prepare('DELETE FROM messages WHERE id = ?').bind(Number(r[1])).run();
    return h.redirect('/admin/mensajes' + (r[2] === 'borrar' ? '?ok=borrado' : ''));
  }
  return h.text('No encontrado', 404);
}
