const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { spawn } = require('node:child_process');
const db = require('../db');
const dirs = [];
function temp() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-sqlite-')); dirs.push(dir); return dir; }
function database(dir) { return path.join(dir, 'database', 'school-data.sqlite'); }
function legacy(dir, value) {
  fs.mkdirSync(path.join(dir, 'database'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'database', 'school-data.json'), JSON.stringify(value));
}
const student = { name: 'طالب تجريبي', schoolNo: 'S1', nni: '1234567890', gender: 'ذكر', className: '6AF' };
afterEach(() => { db.close(); for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

test('creates SQLite and persists CRUD, linked payments, staff, and nested exams across restart', () => {
  const dir = temp(); db.init(dir);
  assert.equal(db.checkLogin('yaghoub', '36485606'), true);
  const s = db.addStudent({ ...student, initialPaid: 100 });
  db.updateStudent(s.id, { ...student, name: 'اسم معدل' });
  db.addStudentPayment({ studentId: s.id, amount: 200, month: 'أكتوبر' });
  const teacher = db.addTeacher({ name: 'مدرس' });
  db.addTeacherPayment({ teacherId: teacher.id, amount: 50, month: 'أكتوبر' });
  db.addTeacherAdvance({ teacherId: teacher.id, amount: 10, month: 'أكتوبر' });
  db.addExpense({ category: 'كتب', amount: 25 });
  db.saveExamSettings({ subjectTemplates: [{ department: '6AF', subjects: [{ id: 'ar', name: 'عربية' }] }] });
  db.saveExamRecord({ studentId: s.id, department: '6AF', examNo: 1, results: [{ subjectId: 'ar', score: 18 }] });
  const expected = db.getData();
  db.close(); db.init(dir);
  assert.deepEqual(db.getData(), expected);
  assert.equal(fs.readFileSync(database(dir)).subarray(0, 16).toString(), 'SQLite format 3\0');
  db.deleteStudent(s.id); db.deleteTeacher(teacher.id);
  assert.equal(db.getData().studentPayments.length, 0);
  assert.equal(db.getData().teacherPayments.length, 0);
  assert.equal(db.getData().teacherAdvances.length, 0);
});

test('imports every collection once, preserves original JSON and optional fields', () => {
  const dir = temp(); db.init(dir);
  db.addStudent(student);
  db.addExpense({ category: 'كتب', amount: 5 });
  const original = db.getData();
  original.students[0].customField = { preserved: true };
  original.departments[0].monthlyFee = 0;
  original.departments[0].customField = 'preserved';
  db.close();
  fs.rmSync(database(dir));
  legacy(dir, original);
  const legacyFile = path.join(dir, 'database', 'school-data.json');
  const bytes = fs.readFileSync(legacyFile);
  db.init(dir);
  assert.deepEqual(db.getData(), original);
  assert.deepEqual(fs.readFileSync(legacyFile), bytes);
  db.addExpense({ category: 'كهرباء', amount: 9 });
  db.close();
  fs.writeFileSync(legacyFile, 'invalid old JSON');
  db.init(dir);
  assert.equal(db.getData().expenses.length, 2);
});

test('invalid migration fails without marking it complete and can be retried', () => {
  const dir = temp(); legacy(dir, { students: 'invalid' });
  assert.throws(() => db.init(dir), /Collection JSON invalide/);
  legacy(dir, { students: [{ id: 1 }, { id: 1 }] });
  assert.throws(() => db.init(dir), /dupliqué/);
  legacy(dir, { students: [] });
  db.init(dir);
  assert.equal(db.getData().students.length, 0);
});

test('malformed JSON is retained and migration stops', () => {
  const dir = temp(); legacy(dir, {});
  const file = path.join(dir, 'database', 'school-data.json');
  fs.writeFileSync(file, '{broken');
  assert.throws(() => db.init(dir), /migrer/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});

test('failed validation and failed writes roll back all changes', () => {
  const dir = temp(); db.init(dir);
  const expected = db.getData();
  assert.throws(() => db.updateSettings({ ...db.publicSettings(), schoolName: 'changed', managerPhone: 'x' }));
  assert.deepEqual(db.getData(), expected);
  const connection = new DatabaseSync(database(dir));
  connection.exec(`CREATE TRIGGER reject_payment BEFORE INSERT ON studentPayments BEGIN SELECT RAISE(ABORT, 'test failure'); END;`);
  assert.throws(() => db.addStudent({ ...student, initialPaid: 100 }), /test failure/);
  assert.deepEqual(db.getData(), expected);
  connection.close();
});

test('clear creates a restorable SQLite backup with all collections', () => {
  const dir = temp(); db.init(dir);
  db.addStudent({ ...student, initialPaid: 100 });
  db.addExpense({ category: 'كتب', amount: 5 });
  const expected = db.getData();
  const backup = db.clearOperationalData();
  assert.equal(db.getData().students.length, 0);
  assert.equal(db.getData().expenses.length, 0);
  const restored = temp(); fs.mkdirSync(path.join(restored, 'database'));
  fs.copyFileSync(backup, database(restored));
  db.init(restored);
  assert.deepEqual(db.getData(), expected);
});

test('concurrent processes preserve writes and allocate distinct IDs', async () => {
  const dir = temp(); db.init(dir);
  const code = `const db = require(process.argv[1]); db.init(process.argv[2]); for (let i = 0; i < 20; i++) db.addExpense({ category: 'test', amount: 1 }); db.close();`;
  await Promise.all(Array.from({ length: 3 }, () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', code, path.resolve(__dirname, '../db.js'), dir]);
    let errors = ''; child.stderr.on('data', chunk => errors += chunk);
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(errors)));
  })));
  const expenses = db.getData().expenses;
  assert.equal(expenses.length, 60);
  assert.equal(new Set(expenses.map(x => x.id)).size, 60);
});


test('HTTP server supports login and CRUD using SQLite', async () => {
  const dir = temp();
  for (const file of ['server.js', 'db.js']) fs.copyFileSync(path.resolve(__dirname, '..', file), path.join(dir, file));
  const previousPort = process.env.SCHOOL_PORT;
  process.env.SCHOOL_PORT = '23780';
  const { startServer } = require(path.join(dir, 'server.js'));
  if (previousPort === undefined) delete process.env.SCHOOL_PORT;
  else process.env.SCHOOL_PORT = previousPort;
  const server = await startServer();
  try {
    const login = await fetch(`${server.url}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'yaghoub', password: '36485606' }) });
    assert.equal(login.status, 200);
    const { token } = await login.json();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const added = await fetch(`${server.url}/api/expenses`, { method: 'POST', headers, body: JSON.stringify({ category: 'test', amount: 15 }) });
    assert.equal(added.status, 200);
    const response = await fetch(`${server.url}/api/data`, { headers });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).expenses[0].amount, 15);
    assert.equal(fs.existsSync(database(dir)), true);
    assert.equal(fs.existsSync(path.join(dir, 'database', 'school-data.json')), false);
  } finally {
    server.close();
    require(path.join(dir, 'db.js')).close();
  }
});
