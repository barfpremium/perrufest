// Simulador local para probar la web sin Cloudflare (solo desarrollo).
// Imita D1 con node:sqlite, R2 con una carpeta y el servicio de archivos estáticos.
//   ADMIN_PASSWORD=algo npm run local   →  http://localhost:8787
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.resolve(process.env.LOCAL_DATA || path.join(ROOT, '.local-data'));
fs.mkdirSync(path.join(DATA, 'r2'), { recursive: true });

// ---------- D1 simulado ----------
const sqlite = new DatabaseSync(path.join(DATA, 'd1.sqlite'));
sqlite.exec('PRAGMA foreign_keys = ON;');
class Stmt {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...args) {
    if (args.some((a) => a === undefined)) throw new Error('D1_TYPE_ERROR: undefined no es un valor válido');
    return new Stmt(this.sql, args);
  }
  _plain(row) { return row ? { ...row } : null; }
  async first(col) { const r = this._plain(sqlite.prepare(this.sql).get(...this.args)); return r && col ? r[col] : r; }
  async all() { return { success: true, results: sqlite.prepare(this.sql).all(...this.args).map((r) => ({ ...r })), meta: {} }; }
  async run() {
    const r = sqlite.prepare(this.sql).run(...this.args);
    return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
  }
}
const DB = {
  prepare: (sql) => new Stmt(sql),
  async batch(stmts) {
    sqlite.exec('BEGIN');
    try { const out = []; for (const s of stmts) out.push(await s.run()); sqlite.exec('COMMIT'); return out; } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
  },
};

// ---------- R2 simulado ----------
const objPath = (key) => path.join(DATA, 'r2', encodeURIComponent(key));
const metaPath = (key) => objPath(key) + '.meta.json';
function objInfo(key) {
  if (!fs.existsSync(objPath(key))) return null;
  const st = fs.statSync(objPath(key));
  const meta = JSON.parse(fs.readFileSync(metaPath(key), 'utf8'));
  return {
    key, size: st.size, httpEtag: `"${st.size}-${Math.floor(st.mtimeMs)}"`, httpMetadata: meta,
    writeHttpMetadata(h) { if (meta.contentType) h.set('Content-Type', meta.contentType); if (meta.cacheControl) h.set('Cache-Control', meta.cacheControl); },
  };
}
const MEDIA = {
  async put(key, body, opts = {}) {
    let buf;
    if (body instanceof ReadableStream) buf = Buffer.from(await new Response(body).arrayBuffer());
    else if (body instanceof ArrayBuffer) buf = Buffer.from(body);
    else if (ArrayBuffer.isView(body)) buf = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
    else buf = Buffer.from(String(body));
    fs.writeFileSync(objPath(key), buf);
    fs.writeFileSync(metaPath(key), JSON.stringify(opts.httpMetadata || {}));
    return objInfo(key);
  },
  async head(key) { return objInfo(key); },
  async get(key, opts = {}) {
    const info = objInfo(key); if (!info) return null;
    const range = opts.range ? { start: opts.range.offset, end: opts.range.offset + opts.range.length - 1 } : {};
    return { ...info, body: Readable.toWeb(fs.createReadStream(objPath(key), range)) };
  },
  async delete(keys) { for (const k of [].concat(keys)) { fs.rmSync(objPath(k), { force: true }); fs.rmSync(metaPath(k), { force: true }); } },
  async list({ prefix = '' } = {}) {
    const objects = fs.readdirSync(path.join(DATA, 'r2')).filter((f) => !f.endsWith('.meta.json')).map(decodeURIComponent).filter((k) => k.startsWith(prefix)).map((key) => ({ key }));
    return { objects, truncated: false };
  },
};

const env = { DB, MEDIA, ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '', MEDIA_URL: process.env.MEDIA_URL || '', CF_VERSION_METADATA: { id: String(Date.now()) } };
const TYPES = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' };

http.createServer(async (req, res) => {
  // Archivos estáticos (en Cloudflare los sirve el servicio de "assets")
  const file = path.join(ROOT, 'public', decodeURIComponent(req.url.split('?')[0]));
  if (file.startsWith(path.join(ROOT, 'public') + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    return fs.createReadStream(file).pipe(res);
  }
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const request = new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method, headers: req.headers, body: hasBody ? Readable.toWeb(req) : undefined, duplex: hasBody ? 'half' : undefined,
  });
  const waits = [];
  try {
    const response = await worker.fetch(request, env, { waitUntil: (p) => waits.push(p) });
    const headers = {};
    response.headers.forEach((v, k) => { headers[k] = k === 'set-cookie' ? response.headers.getSetCookie() : v; });
    res.writeHead(response.status, headers);
    if (response.body && req.method !== 'HEAD') Readable.fromWeb(response.body).pipe(res); else res.end();
  } catch (err) {
    console.error(err); res.writeHead(500); res.end('Error del simulador');
  }
}).listen(Number(process.env.PORT || 8787), () => console.log(`Simulador local en http://localhost:${process.env.PORT || 8787}`));
