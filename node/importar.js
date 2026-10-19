// Copia todos los datos y archivos de la web publicada en Cloudflare a este servidor.
//   ADMIN_PASSWORD=... node node/importar.js https://perrufest.TU-CUENTA.workers.dev
// Se puede repetir sin problema: reemplaza los datos y solo descarga los archivos que falten.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, openStorage } from './server.js';
import { init } from '../src/data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const origin = String(process.argv[2] || process.env.OLD_URL || '').replace(/\/+$/, '');
const password = process.argv[3] || process.env.OLD_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || '';
const ORDER = ['settings', 'events', 'partners', 'photos', 'videos', 'event_partners', 'messages'];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

if (!/^https?:\/\//.test(origin) || !password) {
  console.error('Uso: ADMIN_PASSWORD=contraseña node node/importar.js https://direccion-antigua');
  process.exit(2);
}

async function retry(fn, label, tries = 4) {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (err) {
      if (i >= tries) throw new Error(`${label}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

// 1. Entrar en el panel de la web antigua
log(`Conectando con ${origin} …`);
const login = await retry(() => fetch(`${origin}/admin/entrar`, {
  method: 'POST', redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin },
  body: new URLSearchParams({ password }),
}), 'Acceso al panel');
const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('pf_admin='));
if (!cookie) {
  console.error(`No se pudo entrar en el panel antiguo (respuesta ${login.status}). ¿La contraseña es la misma?`);
  process.exit(1);
}

// 2. Descargar la exportación
const exp = await retry(async () => {
  const r = await fetch(`${origin}/admin/api/exportar`, { headers: { Cookie: cookie } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'respuesta no válida');
  return j;
}, 'Exportación');
log(`Exportación recibida: ${Object.entries(exp.tables).map(([t, rows]) => `${t} ${rows.length}`).join(', ')} · ${exp.files.length} archivos`);

// 3. Guardar los datos
fs.mkdirSync(DATA, { recursive: true });
const db = openDatabase(path.join(DATA, 'perrufest.db'));
await init(db);
db.sqlite.exec('PRAGMA foreign_keys = OFF; BEGIN');
try {
  for (const t of [...ORDER].reverse()) db.sqlite.exec(`DELETE FROM ${t}`);
  for (const t of ORDER) {
    for (const row of exp.tables[t] || []) {
      const cols = Object.keys(row);
      db.sqlite.prepare(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
        .run(...cols.map((c) => row[c]));
    }
  }
  db.sqlite.exec('COMMIT; PRAGMA foreign_keys = ON;');
} catch (err) {
  db.sqlite.exec('ROLLBACK; PRAGMA foreign_keys = ON;');
  throw err;
}
log('Datos guardados.');

// 4. Copiar fotos, carteles, logos y vídeos
const storage = openStorage(path.join(DATA, 'media'));
let done = 0, skipped = 0;
const failed = [];
const queue = [...exp.files];
async function workerLoop() {
  while (queue.length) {
    const f = queue.shift();
    const have = await storage.head(f.key);
    if (have && have.size === f.size) { skipped++; continue; }
    try {
      await retry(async () => {
        const r = await fetch(`${origin}/media/${f.key.split('/').map(encodeURIComponent).join('/')}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        await storage.put(f.key, r.body);
        const got = await storage.head(f.key);
        if (f.size && got.size !== f.size) throw new Error('tamaño distinto');
      }, f.key);
      done++;
      if (done % 50 === 0) log(`  ${done + skipped} de ${exp.files.length} archivos…`);
    } catch (err) { failed.push(err.message); }
  }
}
await Promise.all(Array.from({ length: 6 }, workerLoop));

const summary = { importado: new Date().toISOString(), origen: origin, archivos: exp.files.length, copiados: done, ya_estaban: skipped, fallidos: failed.length };
fs.writeFileSync(path.join(DATA, 'importacion.json'), JSON.stringify({ ...summary, errores: failed.slice(0, 50) }, null, 2));
log(`Terminado: ${done} copiados, ${skipped} ya estaban, ${failed.length} con error.`);
if (failed.length) { failed.slice(0, 10).forEach((e) => console.error('  ✗', e)); process.exit(1); }
