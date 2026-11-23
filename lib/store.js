// Storage. On Vercel: a private Blob store. Locally (no token): files under .data/
// Every write is a new pathname, so nothing is ever read stale after an overwrite.
import fs from 'node:fs/promises';
import path from 'node:path';

const LOCAL = !process.env.BLOB_READ_WRITE_TOKEN;
const ROOT = path.join(process.cwd(), '.data');
let sdk;
async function blob() { return (sdk ||= await import('@vercel/blob')); }

export async function put(pathname, data, contentType = 'application/json') {
  const body = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data);
  if (LOCAL) {
    const f = path.join(ROOT, pathname);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, body);
    await fs.writeFile(f + '.type', contentType);
    return;
  }
  const { put } = await blob();
  await put(pathname, body, { access: 'private', contentType, addRandomSuffix: false, allowOverwrite: true });
}

export async function get(pathname) {
  if (LOCAL) {
    try {
      const f = path.join(ROOT, pathname);
      const buffer = await fs.readFile(f);
      const contentType = await fs.readFile(f + '.type', 'utf8').catch(() => 'application/octet-stream');
      return { buffer, contentType };
    } catch { return null; }
  }
  const { get } = await blob();
  try {
    const r = await get(pathname, { access: 'private' });
    if (!r || r.statusCode !== 200) return null;
    const buffer = Buffer.from(await new Response(r.stream).arrayBuffer());
    return { buffer, contentType: r.blob?.contentType || 'application/octet-stream' };
  } catch { return null; }
}

export async function getJSON(pathname) {
  const r = await get(pathname);
  if (!r) return null;
  try { return JSON.parse(r.buffer.toString('utf8')); } catch { return null; }
}

export async function list(prefix) {
  if (LOCAL) {
    const out = [];
    async function walk(dir) {
      let ents = [];
      try { ents = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) await walk(f);
        else if (!e.name.endsWith('.type')) {
          const p = path.relative(ROOT, f).split(path.sep).join('/');
          if (p.startsWith(prefix)) out.push({ pathname: p, size: (await fs.stat(f)).size });
        }
      }
    }
    await walk(ROOT);
    return out;
  }
  const { list } = await blob();
  const out = [];
  let cursor;
  do {
    const r = await list({ prefix, cursor, limit: 1000 });
    for (const b of r.blobs) out.push({ pathname: b.pathname, size: b.size });
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

// Pathnames end in -<timestamp>.<ext>; the newest one for a given stem wins.
export function latest(files, stem) {
  let best = null;
  for (const f of files) {
    if (!f.pathname.startsWith(stem + '-')) continue;
    const rest = f.pathname.slice(stem.length + 1);
    const m = rest.match(/^(\d{13})\.[a-z0-9]+$/);
    if (!m) continue;
    if (!best || m[1] > best.ts) best = { ...f, ts: m[1] };
  }
  return best;
}
