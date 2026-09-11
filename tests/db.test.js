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
function copySources(dir) {
  fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
  for (const file of ['server.js', 'db.js', path.join('public', 'fees.js')]) {
    fs.copyFileSync(path.resolve(__dirname, '..', file), path.join(dir, file));
  }
}
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

test('splits the amount paid during registration between registration and monthly fees', () => {
  const dir = temp(); db.init(dir);
  db.updateFeeSettings({ registrationFee: 2000, defaultMonthlyFee: 0 });
  const s = db.addStudent({
    ...student,
    initialPaid: 9750,
    initialPaymentMonth: 'أكتوبر',
    initialPaymentDate: '2026-09-09'
  });
  const payments = db.getData().studentPayments.filter(p => p.studentId === s.id);
  assert.deepEqual(payments.map(p => ({ month: p.month, amount: p.amount })), [
    { month: 'رسوم التسجيل', amount: 2000 },
    { month: 'أكتوبر', amount: 7750 }
  ]);
});

test('invoice numbers are never reused after a receipt is deleted or a restart', () => {
  const dir = temp(); db.init(dir);
  const s = db.addStudent(student);
  const first = db.addStudentPayment({ studentId: s.id, amount: 100, month: 'أكتوبر' });
  db.deleteStudentPayment(first.id);
  const second = db.addStudentPayment({ studentId: s.id, amount: 100, month: 'أكتوبر' });
  assert.equal(second.id, first.id, 'ids are recycled');
  assert.notEqual(second.invoiceNo, first.invoiceNo);
  db.deleteStudentPayment(second.id);
  db.close(); db.init(dir);
  const third = db.addStudentPayment({ studentId: s.id, amount: 100, month: 'أكتوبر' });
  const issued = [first, second, third].map(p => p.invoiceNo);
  assert.equal(new Set(issued).size, 3, `duplicated invoice numbers: ${issued}`);
  assert.equal(third.invoiceNo, 'F-000003');
  assert.match(third.time, /^\d{2}:\d{2}$/, 'receipts record the entry time');
  // Salary and advance receipts carry their own series.
  const teacher = db.addTeacher({ name: 'م', role: 'معلم', fixedSalary: 5000 });
  const salary = db.addTeacherPayment({ teacherId: teacher.id, month: 'أكتوبر', amount: 1000, salaryDue: 5000 });
  db.deleteTeacherPayment(salary.id);
  const salaryAgain = db.addTeacherPayment({ teacherId: teacher.id, month: 'أكتوبر', amount: 1000, salaryDue: 5000 });
  assert.equal(salary.receiptNo, 'S-000001'); assert.equal(salaryAgain.receiptNo, 'S-000002');
  assert.match(salaryAgain.time, /^\d{2}:\d{2}$/);
  assert.equal(db.addTeacherAdvance({ teacherId: teacher.id, month: 'أكتوبر', amount: 500, salaryDue: 5000 }).receiptNo, 'A-000001');
  assert.match(third.date, /^\d{4}-\d{2}-\d{2}$/, 'the date stays comparable as text');
});

test('databases without an invoice sequence resume after the highest number issued', () => {
  const dir = temp(); db.init(dir);
  const s = db.addStudent(student);
  db.addStudentPayment({ studentId: s.id, amount: 100, month: 'أكتوبر' });
  db.addStudentPayment({ studentId: s.id, amount: 100, month: 'نوفمبر' });
  db.close();
  const sqlite = new DatabaseSync(database(dir));
  sqlite.prepare("DELETE FROM settings WHERE key = 'invoiceSequence'").run();
  sqlite.close();
  db.init(dir);
  assert.equal(db.getData().invoiceSequence, undefined);
  const next = db.addStudentPayment({ studentId: s.id, amount: 100, month: 'ديسمبر' });
  assert.equal(next.invoiceNo, 'F-000003');
  assert.equal(db.getData().invoiceSequence, 3);
});

test('staff roles are managed from the settings and validated on employees', () => {
  const dir = temp(); db.init(dir);
  assert.deepEqual(db.publicSettings().staffRoles, ['أستاذ', 'معلم', 'محاسب', 'مراقب', 'عامل يدوي', 'أخرى']);
  assert.throws(() => db.addTeacher({ name: 'م', role: 'سائق', fixedSalary: 1000 }), /القائمة/);
  const settings = db.addStaffRole({ name: ' سائق ' });
  assert.equal(settings.staffRoles.at(-1), 'سائق');
  assert.throws(() => db.addStaffRole({ name: 'سائق' }), /موجودة/);
  assert.throws(() => db.addStaffRole({ name: '' }), /أدخل/);
  const driver = db.addTeacher({ name: 'م', role: 'سائق', fixedSalary: 1000 });
  const index = settings.staffRoles.indexOf('سائق');
  assert.throws(() => db.deleteStaffRole(index), /مرتبطة بموظفين/);
  db.updateStaffRole(index, { name: 'سائق الحافلة' });
  assert.equal(db.getData().teachers.find(t => t.id === driver.id).role, 'سائق الحافلة', 'employees follow the renamed role');
  assert.throws(() => db.updateStaffRole(0, { name: 'مدرس' }), /أستاذ/);
  assert.throws(() => db.deleteStaffRole(db.publicSettings().staffRoles.indexOf('أخرى')), /أخرى/);
  db.deleteTeacher(driver.id);
  db.deleteStaffRole(db.publicSettings().staffRoles.indexOf('سائق الحافلة'));
  db.close(); db.init(dir);
  assert.deepEqual(db.publicSettings().staffRoles, ['أستاذ', 'معلم', 'محاسب', 'مراقب', 'عامل يدوي', 'أخرى']);
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
  copySources(dir);
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
    const studentResponse = await fetch(`${server.url}/api/students`, {method:'POST',headers,body:JSON.stringify(student)});
    const created = await studentResponse.json();
    const feeResponse = await fetch(`${server.url}/api/fee-settings`, {method:'PUT',headers,body:JSON.stringify({registrationFee:250,defaultMonthlyFee:1200})});
    assert.equal(feeResponse.status,200);
    assert.equal((await feeResponse.json()).registrationFee,250);
    const discountResponse = await fetch(`${server.url}/api/students/${created.id}/discount`, {method:'PUT',headers,body:JSON.stringify({discountType:'percent',discountValue:10,discountReason:'منحة'})});
    assert.equal(discountResponse.status,200);
    assert.equal((await discountResponse.json()).discountValue,10);
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

test('personal edits preserve the discount; a discount edit preserves identity and payments', () => {
  db.init(temp());
  db.updateFeeSettings({registrationFee:200,defaultMonthlyFee:1000});
  const s = db.addStudent({...student});
  db.updateStudentDiscount(s.id,{discountType:'amount',discountValue:150,discountReason:'إخوة'});
  db.addStudentPayment({studentId:s.id,month:'أكتوبر',amount:400,date:'2026-10-05'});
  db.updateStudent(s.id,{...student,name:'اسم جديد'});
  let saved = db.getData().students[0];
  assert.equal(saved.discountValue,150);
  assert.equal(saved.discountReason,'إخوة');
  const payments = db.getData().studentPayments;
  db.updateStudentDiscount(s.id,{discountType:'percent',discountValue:20,discountReason:'منحة'});
  saved = db.getData().students[0];
  assert.equal(saved.name,'اسم جديد');
  assert.equal(saved.discountType,'percent');
  assert.equal(saved.discountValue,20);
  assert.deepEqual(db.getData().studentPayments,payments);
  assert.throws(()=>db.updateStudentDiscount(s.id,{discountType:'percent',discountValue:140}));
  assert.equal(db.getData().students[0].discountValue,20,'a refused edit changes nothing');
});

test('testing database, settings and reset backups stay separate from production', () => {
  const dir = temp(); db.init(dir);
  const prodStudent = db.addStudent(student);
  db.addStudentPayment({studentId:prodStudent.id,month:'أكتوبر',amount:500});
  const production = db.getData();
  db.init(dir,{mode:'test',initialSettings:production.settings});
  assert.equal(db.getData().students.length,0);
  assert.equal(db.getData().studentPayments.length,0);
  assert.equal(db.checkLogin('yaghoub','36485606'),true);
  db.addStudent({...student,name:'تجريب فقط'});
  const backup = db.clearOperationalData();
  assert.ok(backup.startsWith(path.join(dir,'database','testing','backups')));
  db.init(dir,{mode:'production'});
  assert.deepEqual(db.getData(),production);
  db.init(dir,{mode:'test'});
  assert.equal(db.getData().students.length,0);
  assert.throws(()=>db.init(dir,{mode:'invalid'}));
});

test('mode API persists selection, rejects stale sessions and delayed writes, and preserves both databases', async () => {
  const dir = temp();
  copySources(dir);
  const previousPort = process.env.SCHOOL_PORT;
  process.env.SCHOOL_PORT = '23880';
  const service = require(path.join(dir,'server.js'));
  if(previousPort===undefined) delete process.env.SCHOOL_PORT; else process.env.SCHOOL_PORT=previousPort;
  let server = await service.startServer();
  const request = (endpoint,method='GET',token='',payload) => fetch(server.url+'/api'+endpoint,{method,headers:{'Content-Type':'application/json',Connection:'close',Authorization:`Bearer ${token}`},...(payload ? {body:JSON.stringify(payload)} : {})});
  const login = async()=> (await (await request('/login','POST','',{username:'yaghoub',password:'36485606'})).json()).token;
  try {
    assert.equal((await (await request('/mode')).json()).mode,'production');
    assert.equal((await request('/mode','PUT','',{mode:'test'})).status,401);
    let token = await login();
    await request('/students','POST',token,student);
    assert.equal((await request('/mode','PUT',token,{mode:'invalid'})).status,400);
    // Start an authenticated request in production, but finish its body after switching.
    const http = require('node:http');
    let delayed;
    const delayedResult = new Promise((resolve,reject)=>{
      delayed = http.request(server.url+'/api/expenses',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
      delayed.on('error',reject);delayed.write('{"category":"stale",');
    });
    await new Promise(resolve=>setTimeout(resolve,50));
    const switched = await request('/mode','PUT',token,{mode:'test'});
    assert.equal(switched.status,200);
    const replacement = await switched.json();
    assert.equal((await request('/data','GET',replacement.token)).status,200);
    assert.equal(replacement.settings.applicationMode,'test');
    delayed.end('"amount":50}');
    assert.equal(await delayedResult,400);
    assert.equal((await request('/data','GET',token)).status,401);
    token=await login();
    const empty=await (await request('/data','GET',token)).json();
    assert.equal(empty.students.length,0);assert.equal(empty.expenses.length,0);
    await request('/students','POST',token,{...student,name:'طالب التجريب'});
    assert.equal((await request('/mode','PUT',token,{mode:'production'})).status,200);
    token=await login();
    const restored=await (await request('/data','GET',token)).json();
    assert.equal(restored.students[0].name,student.name);
    await request('/mode','PUT',token,{mode:'test'});
    server.close();server=await service.startServer();
    assert.equal((await (await request('/mode')).json()).mode,'test');
    token=await login();
    assert.equal((await (await request('/data','GET',token)).json()).students[0].name,'طالب التجريب');
  } finally {server.close();require(path.join(dir,'db.js')).close();}
});

test('confirming a sensitive action verifies the password without creating a session', async () => {
  const dir = temp();
  copySources(dir);
  const previousPort = process.env.SCHOOL_PORT;
  process.env.SCHOOL_PORT = '23884';
  const service = require(path.join(dir, 'server.js'));
  if (previousPort === undefined) delete process.env.SCHOOL_PORT; else process.env.SCHOOL_PORT = previousPort;
  const server = await service.startServer();
  const request = (endpoint, method = 'GET', token = '', payload) => fetch(server.url + '/api' + endpoint,
    { method, headers: { 'Content-Type': 'application/json', Connection: 'close', Authorization: `Bearer ${token}` },
      ...(payload ? { body: JSON.stringify(payload) } : {}) });
  try {
    const token = (await (await request('/login', 'POST', '', { username: 'yaghoub', password: '36485606' })).json()).token;

    const ok = await request('/verify-password', 'POST', token, { password: '36485606' });
    assert.equal(ok.status, 200);
    const payload = await ok.json();
    assert.equal(payload.ok, true);
    // The whole point: no second session is handed out for a confirmation.
    assert.equal('token' in payload, false, 'confirming does not mint a session');

    // 403 and not 401, so the interface shows the error instead of reloading.
    const wrong = await request('/verify-password', 'POST', token, { password: 'wrong' });
    assert.equal(wrong.status, 403);

    // It is a privileged endpoint: no valid session, no verification.
    assert.equal((await request('/verify-password', 'POST', '', { password: '36485606' })).status, 401);
  } finally { server.close(); require(path.join(dir, 'db.js')).close(); }
});

test('sessions expire, repeated login failures are throttled, and CORS is limited to loopback', async () => {
  const dir = temp();
  copySources(dir);
  const previous = { port: process.env.SCHOOL_PORT, ttl: process.env.SCHOOL_SESSION_TTL_MS };
  process.env.SCHOOL_PORT = '23882';
  process.env.SCHOOL_SESSION_TTL_MS = '300';
  const { startServer } = require(path.join(dir, 'server.js'));
  for (const [key, value] of [['SCHOOL_PORT', previous.port], ['SCHOOL_SESSION_TTL_MS', previous.ttl]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const server = await startServer();
  const login = (password = '36485606') => fetch(`${server.url}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'yaghoub', password })
  });
  try {
    const { token } = await (await login()).json();
    const headers = { Authorization: `Bearer ${token}` };
    assert.equal((await fetch(`${server.url}/api/data`, { headers })).status, 200);
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal((await fetch(`${server.url}/api/data`, { headers })).status, 401, 'the session expired');

    // A page on another origin gets no permission to read the response.
    const allowed = await fetch(`${server.url}/api/settings`, { headers: { Origin: server.url } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), server.url);
    const foreign = await fetch(`${server.url}/api/settings`, { headers: { Origin: 'https://example.com' } });
    assert.equal(foreign.headers.get('access-control-allow-origin'), null);

    let throttled = null;
    for (let attempt = 0; attempt < 10 && !throttled; attempt++) {
      const response = await login('wrong-password');
      if (response.status === 429) throttled = response;
      else assert.equal(response.status, 401);
    }
    assert.ok(throttled, 'repeated failures are eventually refused');
    assert.match((await throttled.json()).error, /محاولات كثيرة/);
    // The lockout also covers the correct password, so guessing cannot continue.
    assert.equal((await login()).status, 429);
  } finally {
    server.close();
    require(path.join(dir, 'db.js')).close();
  }
});
