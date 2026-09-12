// The web copy (api/[...path].js) run locally: the desktop pushes its snapshot,
// the web function stores it and serves the read-only API the browser uses.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const handler = require('../api/[...path].js');
const student = { name: 'طالب الموقع', schoolNo: 'W1', nni: '1234567890', gender: 'ذكر', className: '6AF' };

test('web copy: sync with token, login, read-only API, every write refused', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-web-'));
  fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
  for (const file of ['server.js', 'db.js', path.join('public', 'fees.js')]) fs.copyFileSync(path.resolve(__dirname, '..', file), path.join(dir, file));
  const previousEnv = { ...process.env };
  Object.assign(process.env, { WEB_SNAPSHOT_FILE: path.join(dir, 'snapshot.json'), WEB_PASSWORD: 'web-secret', WEB_USERNAME: 'viewer', SYNC_TOKEN: 'sync-secret' });
  delete process.env.BLOB_READ_WRITE_TOKEN;
  const web = http.createServer((req, res) => handler(req, res));
  await new Promise(resolve => web.listen(0, '127.0.0.1', resolve));
  const webUrl = `http://127.0.0.1:${web.address().port}`;
  const call = (endpoint, method = 'GET', token = '', payload, headers = {}) => fetch(webUrl + '/api' + endpoint, { method, headers: { 'Content-Type': 'application/json', Connection: 'close', Authorization: `Bearer ${token}`, ...headers }, ...(payload !== undefined ? { body: typeof payload === 'string' || Buffer.isBuffer(payload) ? payload : JSON.stringify(payload) } : {}) });
  process.env.SCHOOL_PORT = '23882';
  const service = require(path.join(dir, 'server.js'));
  const desktop = await service.startServer();
  const desk = (endpoint, method = 'GET', token = '', payload) => fetch(desktop.url + '/api' + endpoint, { method, headers: { 'Content-Type': 'application/json', Connection: 'close', Authorization: `Bearer ${token}` }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
  try {
    // Before any sync the site is up, empty, and still needs a login.
    let mode = await (await call('/mode')).json();
    assert.deepEqual([mode.readOnly, mode.syncedAt, mode.mode], [true, '', 'production']);
    assert.equal((await call('/login', 'POST', '', { username: 'viewer', password: 'wrong' })).status, 401);
    assert.equal((await call('/data')).status, 401);
    let token = (await (await call('/login', 'POST', '', { username: 'viewer', password: 'web-secret' })).json()).token;
    assert.deepEqual((await (await call('/data', 'GET', token)).json()).students, []);
    // Sync needs the token; the desktop pushes gzipped.
    assert.equal((await call('/sync', 'POST', 'nope', { settings: {} })).status, 401);
    assert.equal((await call('/sync', 'POST', 'sync-secret', { settings: {} })).status, 400, 'a malformed snapshot is refused');
    const deskToken = (await (await desk('/login', 'POST', '', { username: 'yaghoub', password: '36485606' })).json()).token;
    await desk('/students', 'POST', deskToken, student);
    await desk('/sync-settings', 'PUT', deskToken, { syncUrl: `${webUrl}/api/sync`, syncToken: 'sync-secret', currentPassword: '36485606' });
    const pushed = await (await desk('/sync-remote', 'POST', deskToken)).json();
    assert.equal(pushed.settings.writesSinceSync, 0);
    assert.ok(fs.existsSync(process.env.WEB_SNAPSHOT_FILE));
    // The site now serves what the desktop holds, through the same endpoints the UI reads.
    mode = await (await call('/mode')).json();
    assert.equal(mode.syncedAt, pushed.lastSyncAt);
    const settings = await (await call('/settings')).json();
    assert.deepEqual([settings.readOnly, settings.applicationMode, settings.schoolName, settings.passwordHash], [true, 'production', 'مدرسة مكارم الأخلاق الحرة', undefined]);
    const data = await (await call('/data', 'GET', token)).json();
    assert.equal(data.students[0].name, student.name);
    assert.equal(data.departments.length, 18);
    assert.equal(data.exams, undefined);
    assert.equal((await (await call('/departments', 'GET', token)).json()).length, 18);
    const exams = await (await call('/exams', 'GET', token)).json();
    assert.ok(Array.isArray(exams.exams) && Array.isArray(exams.settings.subjectTemplates));
    assert.equal((await call('/verify-password', 'POST', token, { password: 'web-secret' })).status, 200);
    assert.equal((await call('/verify-password', 'POST', token, { password: 'x' })).status, 403);
    for (const [endpoint, method] of [['/students', 'POST'], ['/students/1', 'PUT'], ['/students/1', 'DELETE'], ['/expenses', 'POST'], ['/settings', 'PUT'], ['/mode', 'PUT'], ['/reset-data', 'POST']]) {
      const response = await call(endpoint, method, token, {});
      assert.equal(response.status, 405, `${method} ${endpoint}`);
      assert.match((await response.json()).error, /للعرض فقط/);
    }
    assert.equal((await call('/unknown', 'GET', token)).status, 404);
    assert.equal((await call('/logout', 'POST', token)).status, 200);
    // A forged or expired session is refused.
    assert.equal((await call('/data', 'GET', `${Date.now() + 1000}.deadbeef`)).status, 401);
    assert.equal((await call('/data', 'GET', token.replace(/^\d+/, String(Date.now() - 1)))).status, 401);
  } finally {
    desktop.close();
    web.close();
    require(path.join(dir, 'db.js')).close();
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
