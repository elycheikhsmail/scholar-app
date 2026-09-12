const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const dirs = [];
function temp() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-log-')); dirs.push(dir); return dir; }
// Each test gets a fresh module: the logger keeps its directory in module state.
function freshLogger() { delete require.cache[require.resolve('../logger')]; return require('../logger'); }
function copySources(dir) {
  fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
  for (const file of ['server.js', 'db.js', 'logger.js', path.join('public', 'fees.js')]) fs.copyFileSync(path.resolve(__dirname, '..', file), path.join(dir, file));
}
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

test('writes timestamped levels, stacks and JSON details to logs/app.log', () => {
  const dir = temp();
  const log = freshLogger();
  const file = log.init(dir);
  assert.equal(file, path.join(dir, 'logs', 'app.log'));
  assert.equal(log.init(dir), file, 'init is idempotent for the same directory');
  log.info('server started');
  log.warn('API POST /api/students → 400 الاسم مطلوب');
  log.error('SERVER GET /api/data → 500', new Error('boom'), { code: 'SQLITE_BUSY' });
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \[INFO\] server started\n/m);
  assert.match(text, /\[WARN\] API POST \/api\/students → 400 الاسم مطلوب\n/);
  assert.match(text, /\[ERROR\] SERVER GET \/api\/data → 500\n  Error: boom\n {4}at /);
  assert.match(text, /\n  {"code":"SQLITE_BUSY"}\n/);
});

test('rotates app.log into app.1.log … app.3.log beyond the size limit', () => {
  const dir = temp();
  const log = freshLogger();
  log.init(dir, { maxBytes: 200 });
  for (let index = 1; index <= 12; index++) log.error(`entry ${index} ${'x'.repeat(80)}`);
  const names = fs.readdirSync(path.join(dir, 'logs')).sort();
  assert.deepEqual(names, ['app.1.log', 'app.2.log', 'app.3.log', 'app.log']);
  const latest = fs.readFileSync(path.join(dir, 'logs', 'app.log'), 'utf8');
  assert.match(latest, /entry 12 /);
  assert.ok(fs.statSync(path.join(dir, 'logs', 'app.1.log')).size >= 200);
  // The oldest entries fell off the end instead of accumulating forever.
  const all = names.map(name => fs.readFileSync(path.join(dir, 'logs', name), 'utf8')).join('');
  assert.doesNotMatch(all, /entry 1 /);
});

test('logs uncaught exceptions and unhandled rejections without exiting', () => {
  const dir = temp();
  const log = freshLogger();
  log.init(dir);
  const fake = new EventEmitter();
  log.installProcessHandlers(fake);
  log.installProcessHandlers(fake);
  assert.equal(fake.listenerCount('uncaughtException'), 1, 'handlers are installed once');
  fake.emit('uncaughtException', new Error('crash'));
  fake.emit('unhandledRejection', 'plain reason');
  const text = fs.readFileSync(path.join(dir, 'logs', 'app.log'), 'utf8');
  assert.match(text, /\[ERROR\] UNCAUGHT EXCEPTION\n  Error: crash/);
  assert.match(text, /\[ERROR\] UNHANDLED REJECTION\n  plain reason/);
});

test('before init nothing is written and the file is unknown', () => {
  const log = freshLogger();
  assert.equal(log.file(), null);
  assert.doesNotThrow(() => log.error('early failure', new Error('x')));
});

test('server records browser errors and refused requests, and reports the log path', async () => {
  const dir = temp();
  copySources(dir);
  const previousPort = process.env.SCHOOL_PORT;
  process.env.SCHOOL_PORT = '23883';
  const { startServer } = require(path.join(dir, 'server.js'));
  if (previousPort === undefined) delete process.env.SCHOOL_PORT; else process.env.SCHOOL_PORT = previousPort;
  const server = await startServer();
  const logFile = path.join(dir, 'logs', 'app.log');
  const post = (endpoint, payload, headers = {}) => fetch(`${server.url}/api${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', ...headers }, body: JSON.stringify(payload) });
  try {
    const mode = await (await fetch(`${server.url}/api/mode`, { headers: { Connection: 'close' } })).json();
    assert.equal(mode.logFile, logFile);
    assert.match(fs.readFileSync(logFile, 'utf8'), /\[INFO\] server started: version .*, mode production, port 23883/);

    // No login needed: the page may fail before the user signs in.
    const reported = await post('/client-log', { kind: 'error', message: 'Cannot read properties of undefined', stack: 'TypeError: x\n    at renderStudents (students.js:10:5)', page: 'students', version: '1.0.0' });
    assert.equal(reported.status, 200);
    let text = fs.readFileSync(logFile, 'utf8');
    assert.match(text, /\[ERROR\] CLIENT error students Cannot read properties of undefined\n  TypeError: x\n {4}at renderStudents \(students.js:10:5\)\n  version 1\.0\.0\n/);

    // Refused requests keep a trace of what was attempted, as a warning.
    const login = await post('/login', { username: 'yaghoub', password: '36485606' });
    const { token } = await login.json();
    const refused = await post('/students', { name: '' }, { Authorization: `Bearer ${token}` });
    assert.equal(refused.status, 400);
    text = fs.readFileSync(logFile, 'utf8');
    assert.match(text, /\[WARN\] API POST \/api\/students → 400 /);

    // Oversized payloads are truncated, floods refused.
    const long = await post('/client-log', { message: 'y'.repeat(5000) });
    assert.equal(long.status, 200);
    assert.ok(!fs.readFileSync(logFile, 'utf8').includes('y'.repeat(2001)));
    let last = 200;
    for (let index = 0; index < 40; index++) last = (await post('/client-log', { message: `flood ${index}` })).status;
    assert.equal(last, 429);
  } finally {
    server.close();
  }
});
