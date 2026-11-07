/* ===========================================================================
   Supabase de mentira — servidor local que imita a API REST e o Storage.

   Serve só para testar o site na sua máquina, sem precisar de conta no
   Supabase. Ele guarda tudo em memória (some quando o processo termina).

   Uso:
     node tools/mock-supabase.js [porta]

   Depois, aponte o assets/config.js para ele:
     supabaseUrl: 'http://localhost:8787'
     supabaseAnonKey: 'chave-de-teste'
   =========================================================================== */

const http = require('http');
const { URL } = require('url');

const PORT = Number(process.argv[2]) || 8787;

/* Tabelas: as mesmas do supabase.sql */
const DATA = {
  profiles: [],
  posts: [],
  comments: [],
  votes: [],
  comment_votes: []
};

/* Arquivos do Storage: caminho -> Buffer */
const FILES = new Map();

function sendJSON(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/* Só precisamos de filtros "eq." */
function matches(row, query) {
  for (const [key, value] of Object.entries(query)) {
    if (key === 'select' || key === 'order' || key === 'on_conflict' || key === 'limit') continue;
    if (!value.startsWith('eq.')) continue;
    if (String(row[key]) !== value.slice(3)) return false;
  }
  return true;
}

function upsert(table, rows, conflict) {
  const cols = String(conflict || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  rows.forEach((row) => {
    const i = DATA[table].findIndex((existing) => cols.every((c) => String(existing[c]) === String(row[c])));
    if (i >= 0) DATA[table][i] = Object.assign({}, DATA[table][i], row);
    else DATA[table].push(row);
  });
}

function remove(table, query) {
  const keep = DATA[table].filter((row) => !matches(row, query));
  const removed = DATA[table].length - keep.length;
  DATA[table] = keep;
  return removed;
}

function orderBy(rows, spec) {
  if (!spec) return rows;
  const desc = spec.endsWith('.desc');
  const key = spec.replace(/\.(asc|desc)$/, '');
  return rows.slice().sort((a, b) => {
    const x = a[key] || 0;
    const y = b[key] || 0;
    return desc ? y - x : x - y;
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const query = {};
  url.searchParams.forEach((value, key) => { query[key] = value; });

  if (process.env.MOCK_VERBOSE) {
    console.log(`[mock] ${req.method} ${url.pathname}${url.search}`);
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*'
    });
    res.end();
    return;
  }

  /* ---------------- Storage ---------------- */
  const storage = url.pathname.match(/^\/storage\/v1\/object\/(public\/)?([^/]+)\/(.+)$/);
  if (storage) {
    const isPublic = Boolean(storage[1]);
    const path = decodeURIComponent(storage[3]);

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = await readBody(req);
      FILES.set(path, body);
      sendJSON(res, 200, { Key: path });
      return;
    }
    if (req.method === 'GET' && isPublic) {
      const file = FILES.get(path);
      if (!file) {
        res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
        res.end('nao encontrado');
        return;
      }
      const type = path.endsWith('.png') ? 'image/png'
        : path.endsWith('.jpg') || path.endsWith('.jpeg') ? 'image/jpeg'
        : path.endsWith('.webp') ? 'image/webp'
        : path.endsWith('.gif') ? 'image/gif'
        : path.endsWith('.mp4') ? 'video/mp4'
        : path.endsWith('.webm') ? 'video/webm'
        : path.endsWith('.ogv') ? 'video/ogg'
        : 'application/octet-stream';

      /* Vídeo precisa de resposta parcial (Range) para o navegador
         poder buscar o começo e advancing a barra de tempo. */
      const range = req.headers.range;
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        const start = m && m[1] ? parseInt(m[1], 10) : 0;
        const end = m && m[2] ? parseInt(m[2], 10) : file.length - 1;
        const chunk = file.slice(start, end + 1);
        res.writeHead(206, {
          'Content-Type': type,
          'Content-Length': chunk.length,
          'Content-Range': `bytes ${start}-${end}/${file.length}`,
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(chunk);
        return;
      }

      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': file.length,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(file);
      return;
    }
    if (req.method === 'DELETE') {
      FILES.delete(path);
      sendJSON(res, 200, { message: 'removido' });
      return;
    }
  }

  /* ---------------- REST ---------------- */
  const rest = url.pathname.match(/^\/rest\/v1\/([^/]+)$/);
  if (rest) {
    const table = rest[1];
    if (!DATA[table]) {
      sendJSON(res, 404, { message: 'tabela desconhecida: ' + table });
      return;
    }

    if (req.method === 'GET') {
      const rows = orderBy(DATA[table].filter((row) => matches(row, query)), query.order);
      sendJSON(res, 200, rows);
      return;
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      let parsed = [];
      try { parsed = JSON.parse(body.toString('utf8') || '[]'); } catch (e) {
        console.error('[mock] corpo inválido em POST ' + table + ':', body.toString('utf8').slice(0, 300));
        parsed = [];
      }
      if (!Array.isArray(parsed)) parsed = [parsed];
      upsert(table, parsed, query.on_conflict);
      if (process.env.MOCK_VERBOSE) console.log('[mock] gravou ' + parsed.length + ' linha(s) em ' + table);
      sendJSON(res, 201, parsed);
      return;
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      let patch = {};
      try { patch = JSON.parse(body.toString('utf8') || '{}'); } catch (e) { patch = {}; }
      DATA[table].forEach((row) => { if (matches(row, query)) Object.assign(row, patch); });
      sendJSON(res, 200, []);
      return;
    }
    if (req.method === 'DELETE') {
      const removed = remove(table, query);
      sendJSON(res, 200, { removed });
      return;
    }
  }

  /* ---------------- inspeção ---------------- */
  if (url.pathname === '/__dump') {
    sendJSON(res, 200, { data: DATA, files: Array.from(FILES.keys()) });
    return;
  }
  if (url.pathname === '/__reset') {
    Object.keys(DATA).forEach((k) => { DATA[k] = []; });
    FILES.clear();
    sendJSON(res, 200, { ok: true });
    return;
  }

  res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
  res.end('nao encontrado');
});

server.listen(PORT, () => {
  console.log(`Supabase de mentira rodando em http://localhost:${PORT}`);
  console.log('GET /__dump   -> ve o que tem no banco');
  console.log('GET /__reset  -> limpa tudo');
});
