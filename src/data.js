// Acceso a datos: Cloudflare D1 (SQLite) para la información y R2 para fotos y archivos
import { today, formatRange } from './util.js';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, town TEXT NOT NULL, venue TEXT DEFAULT '', title TEXT DEFAULT '',
    start_date TEXT, end_date TEXT, date_text TEXT DEFAULT '', schedule TEXT DEFAULT '', poster TEXT DEFAULT '',
    program TEXT DEFAULT '', access TEXT DEFAULT '', prices TEXT DEFAULT '', address TEXT DEFAULT '', maps_url TEXT DEFAULT '',
    description TEXT DEFAULT '', cover_photo_id INTEGER, published INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE, file TEXT NOT NULL,
    w INTEGER, h INTEGER, grp TEXT DEFAULT '', sort INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS photos_event ON photos(event_id, sort, id)`,
  `CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    title TEXT DEFAULT '', url TEXT DEFAULT '', file TEXT DEFAULT '', sort INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS partners (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT DEFAULT 'colaborador', logo TEXT DEFAULT '', url TEXT DEFAULT '', sort INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS event_partners (
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE, PRIMARY KEY (event_id, partner_id))`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY, created_at TEXT DEFAULT CURRENT_TIMESTAMP, name TEXT, entity TEXT, email TEXT, phone TEXT,
    kind TEXT, message TEXT, is_read INTEGER DEFAULT 0, notify_error TEXT DEFAULT '')`,
];

const P = '[PENDIENTE]';
export const DEFAULTS = {
  site_name: 'Perrufest',
  site_tagline: 'Festival Perruno Familiar',
  logo: '/static/img/perrufest-logo-1600.jpg',
  hero_image: '',
  color_primary: '#D62957',
  color_secondary: '#00212A',
  color_accent: '#ADC302',
  intro_title: 'Un festival para disfrutar con tu perro y en familia',
  intro_text: 'Perrufest reúne exhibiciones caninas, actividades para peques, puestos y profesionales del sector en un ambiente alegre y familiar. Vamos recorriendo localidades de Madrid y alrededores para que perros y personas lo pasen en grande.',
  features: JSON.stringify([
    { icon: 'dog', title: 'Exhibiciones caninas', text: 'Demostraciones con perros y sus guías para aprender y disfrutar.' },
    { icon: 'family', title: 'Actividades en familia', text: 'Propuestas para peques y mayores durante todo el festival.' },
    { icon: 'stall', title: 'Puestos y profesionales', text: 'Productos, servicios y consejos de profesionales del mundo canino.' },
    { icon: 'heart', title: 'Encuentro perruno', text: 'Un punto de reunión para quienes compartimos la vida con perros.' },
  ]),
  upcoming_empty: 'Estamos preparando el próximo Perrufest. Pronto anunciaremos la localidad y las fechas.',
  participate_text: '¿Quieres traer tu puesto, realizar una actividad, colaborar o proponer una localidad? Cuéntanos tu idea.',
  contact_email: '',
  whatsapp: '',
  instagram: '',
  notify_email: '',
  featured_event_id: '',
  org_name: '',
  org_nif: '',
  org_address: '',
  org_email: '',
  legal_text: `${P} Borrador orientativo. Debe completarse y revisarse con la entidad organizadora antes de publicar la web.

## Titular de la web
En cumplimiento de la Ley 34/2002 de Servicios de la Sociedad de la Información (LSSI-CE), se informa de que este sitio web es titularidad de **{org_name}**, con NIF **{org_nif}** y domicilio en **{org_address}**. Correo de contacto: **{org_email}**.

## Uso del sitio
Este sitio informa sobre el festival Perrufest, sus próximas ediciones y las galerías de ediciones anteriores. Quien lo visita se compromete a hacer un uso adecuado de sus contenidos.

## Propiedad intelectual e imágenes
Los textos, el logotipo y las fotografías pertenecen a la organización o a sus autores. Las fotografías de las galerías pueden descargarse para uso personal. Si apareces en alguna imagen y quieres que la retiremos, escríbenos desde la página de contacto.

## Enlaces
Este sitio puede incluir enlaces a webs de terceros (redes sociales, vídeos, mapas). La organización no se responsabiliza de sus contenidos.`,
  privacy_text: `${P} Borrador orientativo. Debe adaptarse a la entidad organizadora y revisarse antes de publicar la web.

## Responsable del tratamiento
**{org_name}**, NIF **{org_nif}**, **{org_address}**. Contacto: **{org_email}**.

## Qué datos tratamos y para qué
Cuando nos escribes con el formulario de «Participa / Contacto» tratamos tu nombre, la entidad o negocio (si la indicas), tu correo, tu teléfono (si lo indicas) y tu mensaje, únicamente para responder a tu solicitud y, en su caso, gestionar tu participación o colaboración en el festival.

## Base legal
Tu consentimiento al enviar el formulario y, cuando corresponda, la aplicación de medidas precontractuales a petición tuya.

## Conservación
Conservaremos los datos el tiempo necesario para atender tu solicitud y, después, durante los plazos legalmente exigibles. ${P} Indicar plazo.

## Destinatarios
No cedemos tus datos a terceros salvo obligación legal. Los datos se alojan en el proveedor de hosting de la web. ${P} Indicar proveedores (hosting, correo).

## Imágenes del festival
Las fotografías de las galerías se publican para compartir el recuerdo del festival. Si apareces en alguna y quieres que la retiremos, solicítalo desde el formulario de contacto.

## Tus derechos
Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a **{org_email}**. También puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).

## Cookies
Esta web solo usa una cookie técnica para el acceso al panel de gestión. No usa cookies de análisis ni publicidad. Los vídeos de YouTube o Vimeo, si se reproducen, pueden instalar sus propias cookies.`,
};


// ---------- Inicialización (crea las tablas la primera vez) ----------
let ready = null;
export function init(db) {
  ready ||= (async () => {
    await db.batch(SCHEMA.map((s) => db.prepare(s)));
    const seeded = await db.prepare("SELECT 1 AS x FROM settings WHERE key = '_seeded'").first();
    if (!seeded) {
      const any = await db.prepare('SELECT 1 AS x FROM events LIMIT 1').first();
      const stmts = [db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('_seeded', '1')")];
      if (!any) {
        stmts.unshift(db.prepare('INSERT INTO events (slug, town, start_date, end_date, published) VALUES (?, ?, ?, ?, 1)')
          .bind('san-martin-de-la-vega-2026', 'San Martín de la Vega', '2026-09-26', '2026-09-27'));
      }
      await db.batch(stmts);
    }
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

const all = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;
const one = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
export { all, one };

// ---------- Ajustes ----------
export async function getSettings(db) {
  const s = { ...DEFAULTS };
  for (const row of await all(db, 'SELECT key, value FROM settings')) s[row.key] = row.value;
  try { s.featuresList = JSON.parse(s.features); } catch { s.featuresList = []; }
  return s;
}
export async function setSettings(db, obj) {
  const stmts = Object.entries(obj).filter(([k]) => k in DEFAULTS).map(([k, v]) =>
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, String(v ?? '')));
  if (stmts.length) await db.batch(stmts);
}

// ---------- Eventos ----------
const EVENT_SQL = `SELECT x.*, c.file AS cover_file FROM (
  SELECT e.*,
    (SELECT COUNT(*) FROM photos p WHERE p.event_id = e.id) AS photo_count,
    COALESCE((SELECT id FROM photos WHERE id = e.cover_photo_id AND event_id = e.id),
             (SELECT id FROM photos WHERE event_id = e.id ORDER BY sort, id LIMIT 1)) AS cover_id
  FROM events e %WHERE%) x LEFT JOIN photos c ON c.id = x.cover_id
  ORDER BY COALESCE(x.start_date, '9999') DESC, x.id DESC`;

export function decorate(e) {
  if (!e) return e;
  const t = today();
  const last = e.end_date || e.start_date;
  e.isPast = !!last && last < t;
  e.dateLabel = e.date_text || formatRange(e.start_date, e.end_date) || 'Fechas por confirmar';
  e.displayTitle = e.title || e.town;
  e.photoCount = e.photo_count || 0;
  e.cover = e.cover_id ? { id: e.cover_id, event_id: e.id, file: e.cover_file } : null;
  return e;
}
export const listEvents = async (db, includeDrafts = false) =>
  (await all(db, EVENT_SQL.replace('%WHERE%', includeDrafts ? '' : 'WHERE e.published = 1'))).map(decorate);
export const upcomingEvents = async (db) => (await listEvents(db)).filter((e) => !e.isPast).reverse();
export const pastEvents = async (db) => (await listEvents(db)).filter((e) => e.isPast);
export const getEvent = async (db, id) => decorate(await one(db, EVENT_SQL.replace('%WHERE%', 'WHERE e.id = ?'), id));
export const getEventBySlug = async (db, slug) => decorate(await one(db, EVENT_SQL.replace('%WHERE%', 'WHERE e.slug = ?'), slug));

export const photosOf = (db, eventId) => all(db, 'SELECT * FROM photos WHERE event_id = ? ORDER BY sort, id', eventId);
export const videosOf = (db, eventId) => all(db, 'SELECT * FROM videos WHERE event_id = ? ORDER BY sort, id', eventId);
export const partnersOf = (db, eventId) => all(db,
  "SELECT p.* FROM partners p JOIN event_partners ep ON ep.partner_id = p.id WHERE ep.event_id = ? AND p.kind != 'organizador' ORDER BY p.sort, p.id", eventId);
/** Organizadores: aparecen siempre, en todas las ediciones */
export const organizers = (db) => all(db, "SELECT * FROM partners WHERE kind = 'organizador' ORDER BY sort, id");
export async function allPartners(db) {
  const rows = await all(db, 'SELECT * FROM partners ORDER BY sort, id');
  const links = await all(db, `SELECT ep.partner_id, e.id, e.slug, e.town, e.start_date, e.published FROM event_partners ep
    JOIN events e ON e.id = ep.event_id ORDER BY COALESCE(e.start_date, '9999') DESC`);
  for (const p of rows) p.events = links.filter((l) => l.partner_id === p.id && l.published);
  return rows;
}
