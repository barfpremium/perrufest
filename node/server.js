// Perrufest · servidor propio (Node 22+).
// Ejecuta el mismo código de la web (src/worker.js) fuera de Cloudflare:
//   - la base de datos D1 se sustituye por SQLite (node:sqlite)
//   - el almacén R2 se sustituye por una carpeta en disco
// Variables: ADMIN_PASSWORD, DATA_DIR (por defecto ./data), PORT (por defecto 3000), RESEND_API_KEY, MAIL_FROM
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const MEDIA_DIR = path.join(DATA, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// ---------- Base de datos (misma interfaz que Cloudflare D1) ----------
export function openDatabase(file) {
  const sqlite = new DatabaseSync(file);
  sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  class Stmt {
    constructor(sql, args = []) { this.sql = sql; this.args = args; }
    bind(...args) {
      if (args.some((a) => a === undefined)) throw new Error('D1_TYPE_ERROR: undefined no es un valor válido');
      return new Stmt(this.sql, args);
    }
    async first(col) { const r = sqlite.prepare(this.sql).get(...this.args); const o = r ? { ...r } : null; return o && col ? o[col] : o; }
    async all() { return { success: true, results: sqlite.prepare(this.sql).all(...this.args).map((r) => ({ ...r })), meta: {} }; }
    async run() {
      const r = sqlite.prepare(this.sql).run(...this.args);
      return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
    }
  }
  return {
    sqlite,
    prepare: (sql) => new Stmt(sql),
    async batch(stmts) {
      sqlite.exec('BEGIN');
      try { const out = []; for (const s of stmts) out.push(await s.run()); sqlite.exec('COMMIT'); return out; } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  };
}

// ---------- Almacén de archivos (misma interfaz que Cloudflare R2) ----------
const TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};
const IMMUTABLE = 'public, max-age=31536000, immutable';
export function openStorage(dir) {
  const fileOf = (key) => {
    const p = path.resolve(dir, key);
    if (!p.startsWith(dir + path.sep)) throw new Error('Ruta no válida');
    return p;
  };
  const info = (key) => {
    let st; try { st = fs.statSync(fileOf(key)); } catch { return null; }
    if (!st.isFile()) return null;
    const type = TYPES[path.extname(key).toLowerCase()] || 'application/octet-stream';
    return {
      key, size: st.size, httpEtag: `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`,
      writeHttpMetadata(h) { h.set('Content-Type', type); h.set('Cache-Control', IMMUTABLE); },
    };
  };
  return {
    async put(key, body) {
      const file = fileOf(key);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
      if (body instanceof ReadableStream) {
        await new Promise((resolve, reject) => {
          const ws = fs.createWriteStream(tmp);
          Readable.fromWeb(body).on('error', reject).pipe(ws).on('finish', resolve).on('error', reject);
        });
      } else if (body instanceof ArrayBuffer) fs.writeFileSync(tmp, Buffer.from(body));
      else if (ArrayBuffer.isView(body)) fs.writeFileSync(tmp, Buffer.from(body.buffer, body.byteOffset, body.byteLength));
      else fs.writeFileSync(tmp, String(body));
      fs.renameSync(tmp, file);
      return info(key);
    },
    async head(key) { return info(key); },
    async get(key, opts = {}) {
      const i = info(key); if (!i) return null;
      const range = opts.range ? { start: opts.range.offset, end: opts.range.offset + opts.range.length - 1 } : {};
      return { ...i, body: Readable.toWeb(fs.createReadStream(fileOf(key), range)) };
    },
    async delete(keys) { for (const k of [].concat(keys)) { try { fs.rmSync(fileOf(k), { force: true }); } catch { /* nada */ } } },
    async list({ prefix = '' } = {}) {
      const base = path.join(dir, prefix.replace(/[^/]*$/, ''));
      const objects = [];
      const walk = (d) => {
        let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (!e.name.includes('.tmp-')) {
            const key = path.relative(dir, p).split(path.sep).join('/');
            if (key.startsWith(prefix)) objects.push({ key, size: fs.statSync(p).size });
          }
        }
      };
      walk(base);
      return { objects, truncated: false };
    },
  };
}

// ---------- Servidor HTTP ----------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const env = {
    DB: openDatabase(path.join(DATA, 'perrufest.db')),
    MEDIA: openStorage(MEDIA_DIR),
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
    SESSION_SECRET: process.env.SESSION_SECRET || '',
    RESEND_API_KEY: process.env.RESEND_API_KEY || '',
    MAIL_FROM: process.env.MAIL_FROM || '',
    MEDIA_URL: process.env.MEDIA_URL || '',
    CF_VERSION_METADATA: { id: process.env.APP_VERSION || String(Date.now()) },
  };
  const PUBLIC = path.join(ROOT, 'public');

  http.createServer(async (req, res) => {
    try {
      // Archivos fijos (CSS, JS, imágenes del diseño)
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath.startsWith('/static/')) {
        const file = path.resolve(PUBLIC, '.' + urlPath);
        if (file.startsWith(PUBLIC + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
          res.writeHead(200, {
            'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': req.url.includes('?v=') ? IMMUTABLE : 'public, max-age=3600',
            'Content-Length': fs.statSync(file).size,
          });
          if (req.method === 'HEAD') return res.end();
          return fs.createReadStream(file).pipe(res);
        }
      }
      const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (v != null && !k.startsWith(':')) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
      const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      headers.set('cf-connecting-ip', ip);
      const hasBody = !['GET', 'HEAD'].includes(req.method);
      const request = new Request(`${proto}://${req.headers.host || 'localhost'}${req.url}`, {
        method: req.method, headers, body: hasBody ? Readable.toWeb(req) : undefined, duplex: hasBody ? 'half' : undefined,
      });
      const response = await worker.fetch(request, env, { waitUntil: (p) => Promise.resolve(p).catch((e) => console.error(e)) });
      const out = {};
      response.headers.forEach((v, k) => { out[k] = v; });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) out['set-cookie'] = cookies;
      res.writeHead(response.status, out);
      if (response.body && req.method !== 'HEAD') Readable.fromWeb(response.body).on('error', () => res.destroy()).pipe(res);
      else res.end();
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Ha ocurrido un error. Inténtalo de nuevo en unos segundos.');
    }
  }).listen(Number(process.env.PORT || 3000), () => console.log(`Perrufest en el puerto ${process.env.PORT || 3000} · datos en ${DATA}`));
}
