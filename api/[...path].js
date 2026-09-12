// Read-only web copy of the school application (NOTES-WEB-READONLY.md, step 4),
// deployed on Vercel as one function behind /api/*. The desktop pushes its
// snapshot to POST /api/sync; this function stores it (Vercel Blob, private)
// and serves back exactly what the browser scripts in public/ read. Every
// other write is refused: the page hides its forms, the API answers 405.
//
// Environment: WEB_PASSWORD (required; WEB_USERNAME optional), SYNC_TOKEN
// (required, the same as in the desktop settings), BLOB_READ_WRITE_TOKEN
// (Vercel Blob) — or WEB_SNAPSHOT_FILE for a local run without Blob.
const crypto = require('node:crypto');
const fs = require('node:fs');
const zlib = require('node:zlib');
const { version } = require('../package.json');

const READ_ONLY_MESSAGE = 'هذه النسخة للعرض فقط؛ لا يمكن الحفظ أو التعديل.';
const SNAPSHOT_PATH = 'school/snapshot.json';
const SESSION_HOURS = 12;
const MAX_BODY = 20 * 1024 * 1024;
const COLLECTIONS = ['departments', 'students', 'studentPayments', 'teachers', 'teacherPayments', 'teacherAdvances', 'expenses', 'exams'];
const env = key => process.env[key] || '';

// --- Snapshot storage -------------------------------------------------------
// Vercel Blob keeps one private object; a file does the same job locally. The
// parsed snapshot stays in memory and is re-read only when the ETag changes.
let cache = { etag: '', snapshot: null, checkedAt: 0 };
async function loadSnapshot() {
  if (Date.now() - cache.checkedAt < 5000) return cache.snapshot;
  if (env('BLOB_READ_WRITE_TOKEN')) {
    const { get } = require('@vercel/blob');
    let result;
    try { result = await get(SNAPSHOT_PATH, { access: 'private', ifNoneMatch: cache.etag || undefined }); } catch (error) {
      if (error?.name === 'BlobNotFoundError' || /not found/i.test(error?.message || '')) result = null; else throw error;
    }
    if (result && result.statusCode === 200) {
      cache = { etag: result.blob.etag, snapshot: JSON.parse(await new Response(result.stream).text()), checkedAt: Date.now() };
    } else if (!result) cache = { etag: '', snapshot: null, checkedAt: Date.now() };
    else cache.checkedAt = Date.now();
    return cache.snapshot;
  }
  const file = env('WEB_SNAPSHOT_FILE');
  if (!file || !fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  const etag = `${stat.size}-${stat.mtimeMs}`;
  if (etag !== cache.etag) cache = { etag, snapshot: JSON.parse(fs.readFileSync(file, 'utf8')), checkedAt: Date.now() };
  return cache.snapshot;
}
async function storeSnapshot(text) {
  if (env('BLOB_READ_WRITE_TOKEN')) {
    const { put } = require('@vercel/blob');
    await put(SNAPSHOT_PATH, text, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
  } else {
    const file = env('WEB_SNAPSHOT_FILE');
    if (!file) throw new Error('لم يُضبط مكان تخزين النسخة (BLOB_READ_WRITE_TOKEN أو WEB_SNAPSHOT_FILE).');
    fs.writeFileSync(`${file}.tmp`, text); fs.renameSync(`${file}.tmp`, file);
  }
  cache = { etag: '', snapshot: null, checkedAt: 0 };
}

// The desktop sends the snapshot gzipped; a plain JSON body is accepted too.
function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new Error('النسخة المرسلة غير صالحة.');
  if (!snapshot.settings || typeof snapshot.settings !== 'object') throw new Error('النسخة المرسلة بلا إعدادات.');
  for (const key of COLLECTIONS) if (!Array.isArray(snapshot[key])) throw new Error(`النسخة المرسلة بلا مجموعة ${key}.`);
  if ('passwordHash' in snapshot.settings) throw new Error('النسخة المرسلة تحتوي بيانات دخول.');
  return snapshot;
}

// --- Sessions ---------------------------------------------------------------
// Stateless bearer tokens: "<expiry>.<hmac>", signed with a secret derived from
// the deployment's own secrets, so any instance can verify them.
const secret = () => env('WEB_SESSION_SECRET') || crypto.createHash('sha256').update(`${env('WEB_PASSWORD')}|${env('SYNC_TOKEN')}`).digest('hex');
const sign = payload => crypto.createHmac('sha256', secret()).update(payload).digest('hex');
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function issueToken() { const expires = Date.now() + SESSION_HOURS * 3600 * 1000; return `${expires}.${sign(String(expires))}`; }
function validToken(token) {
  const [expires, signature] = String(token || '').split('.');
  return /^\d+$/.test(expires || '') && Number(expires) > Date.now() && safeEqual(signature, sign(expires));
}
const bearer = req => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
function checkLogin(username, password, snapshot) {
  const expectedUser = env('WEB_USERNAME') || snapshot?.settings?.username || 'admin';
  return !!env('WEB_PASSWORD') && safeEqual(username, expectedUser) && safeEqual(password, env('WEB_PASSWORD'));
}

// --- HTTP helpers -----------------------------------------------------------
function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}
// Vercel may have parsed the body already (req.body); a plain Node server has not.
async function rawBody(req) {
  if (req.body !== undefined) return Buffer.isBuffer(req.body) ? req.body : typeof req.body === 'string' ? Buffer.from(req.body) : Buffer.from(JSON.stringify(req.body));
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw new Error('النسخة المرسلة أكبر من الحد المسموح.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function jsonBody(req) {
  const raw = await rawBody(req);
  const type = String(req.headers['content-type'] || '');
  const bytes = type.includes('gzip') || req.headers['content-encoding'] === 'gzip' ? zlib.gunzipSync(raw) : raw;
  return bytes.length ? JSON.parse(bytes.toString('utf8')) : {};
}
const emptySettings = () => ({ schoolName: 'حسابات المدرسة', schoolYear: '', username: env('WEB_USERNAME') || 'admin', registrationFee: 0, defaultMonthlyFee: 0, managerName: '', managerPhone: '', schoolPhone: '', republic: 'الجمهورية الإسلامية الموريتانية', ministry: 'وزارة التعليم', regional: 'الإدارة الجهوية للتعليم', staffRoles: [] });
function settingsOf(snapshot) {
  return { ...(snapshot?.settings || emptySettings()), applicationMode: 'production', readOnly: true, version, syncedAt: snapshot?.exportedAt || '' };
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const parts = Array.isArray(req.query?.path) ? ['api', ...req.query.path] : url.pathname.split('/').filter(Boolean);
  const route = parts[1] || '';
  const method = req.method;
  try {
    if (method === 'OPTIONS') return json(res, 204, {});
    if (route === 'sync' && method === 'POST') {
      if (!env('SYNC_TOKEN') || !safeEqual(bearer(req), env('SYNC_TOKEN'))) return json(res, 401, { error: 'رمز المزامنة غير صحيح.' });
      const snapshot = validateSnapshot(await jsonBody(req));
      await storeSnapshot(JSON.stringify(snapshot));
      return json(res, 200, { ok: true, storedAt: new Date().toISOString(), records: COLLECTIONS.reduce((n, key) => n + snapshot[key].length, 0) });
    }
    const snapshot = await loadSnapshot();
    if (route === 'mode' && method === 'GET') return json(res, 200, { mode: 'production', label: 'وضع الإنتاج', version, readOnly: true, syncedAt: snapshot?.exportedAt || '' });
    if (route === 'login' && method === 'POST') {
      const body = await jsonBody(req);
      if (!checkLogin(body.username, body.password, snapshot)) return json(res, 401, { error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
      return json(res, 200, { token: issueToken(), settings: settingsOf(snapshot) });
    }
    if (route === 'settings' && method === 'GET') return json(res, 200, settingsOf(snapshot));
    if (!validToken(bearer(req))) return json(res, 401, { error: 'يجب تسجيل الدخول.' });
    if (route === 'logout' && method === 'POST') return json(res, 200, { ok: true });
    if (route === 'verify-password' && method === 'POST') {
      const body = await jsonBody(req);
      return safeEqual(body.password, env('WEB_PASSWORD')) ? json(res, 200, { ok: true }) : json(res, 403, { error: 'كلمة المرور غير صحيحة.' });
    }
    if (method !== 'GET') return json(res, 405, { error: READ_ONLY_MESSAGE });
    if (route === 'data') {
      const data = { settings: settingsOf(snapshot) };
      for (const key of COLLECTIONS) if (key !== 'exams') data[key] = snapshot?.[key] || [];
      return json(res, 200, data);
    }
    if (route === 'departments') return json(res, 200, snapshot?.departments || []);
    if (route === 'exams') return json(res, 200, { settings: snapshot?.examSettings || { header: {}, subjectTemplates: [], remarksRules: [], decisionRules: [] }, exams: snapshot?.exams || [] });
    return json(res, 404, { error: 'المسار غير موجود.' });
  } catch (error) {
    // A malformed snapshot is the sender's mistake (400); anything else is ours (500).
    const status = error instanceof SyntaxError || /غير صالحة|بلا|الحد المسموح|بيانات دخول/.test(error.message) ? 400 : 500;
    if (status === 500) console.error('WEB API ERROR:', error);
    return json(res, status, { error: error.message || 'حدث خطأ.' });
  }
}
module.exports = handler;
module.exports.handler = handler;
