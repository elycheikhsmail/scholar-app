const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const db = require('../db');
const dues = require('../public/fees.js');
const { seedTesting, LEVELS } = require('../scripts/seed-testing');

test('the testing database gets a February in progress: levels, pupils, dues, staff; production is untouched', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-seed-testing-'));
  try {
    db.init(dir);
    db.updateSettings({ schoolName: 'مدرسة الاختبار', schoolYear: '2026 / 2027' });
    db.addUser({ username: 'admin', role: 'admin', password: 'secret' });
    db.addStudent({ schoolNo: 'PROD-1', name: 'طالب الإنتاج', gender: 'ذكر', nni: '9999999999', className: 'Jardin' });
    const production = db.getData(); db.close();

    const first = await seedTesting(dir);
    assert.equal(first.testDate, '2027-02-28');
    assert.ok(fs.existsSync(first.backupPath));
    db.init(dir); assert.deepEqual(db.getData(), production); db.close();

    db.init(dir, { mode: 'test' });
    const data = db.getData();
    assert.equal(data.settings.schoolName, 'مدرسة الاختبار');
    assert.equal(db.checkLogin('admin', 'secret')?.role, 'admin', 'the accounts followed production into the test database');
    assert.equal(db.publicSettings().testDate, '2027-02-28');
    assert.deepEqual(data.departments.map(d => [d.name, d.monthlyFee]), LEVELS.map(l => [l.name, l.fee]));
    for (const level of LEVELS) {
      const count = data.students.filter(s => s.className === level.name).length;
      assert.ok(count >= 20 && count <= 50, `${level.name}: ${count}`);
    }
    const settings = { ...data.settings, departments: data.departments, asOf: '2027-02-28' };
    let clearBeforeFebruary = 0, owing = 0;
    for (const student of data.students) {
      const payments = data.studentPayments.filter(p => p.studentId === student.id);
      for (const payment of payments) assert.ok(payment.date >= student.registrationDate && payment.date <= '2027-02-28', `${student.schoolNo} ${payment.month} ${payment.date}`);
      const ledger = dues.ledgerFor(student, payments, settings);
      assert.equal(ledger.credit, 0);
      if (ledger.accruedRows.filter(r => r.month !== 'فبراير').every(r => r.remaining <= 0)) clearBeforeFebruary++;
      if (ledger.outstanding > 0) owing++;
    }
    assert.ok(clearBeforeFebruary > data.students.length / 2, `${clearBeforeFebruary} of ${data.students.length} paid up`);
    assert.ok(owing > data.students.length / 10, `${owing} owing`);
    const primaryLevels = LEVELS.filter(l => ['روضة', 'ابتدائي'].includes(l.stage)).length;
    const instructors = data.teachers.filter(t => t.role === 'معلم'), teachers = data.teachers.filter(t => t.role === 'أستاذ');
    assert.equal(instructors.length, primaryLevels);
    assert.ok(instructors.every(t => t.fixedSalary === 6000));
    assert.equal(teachers.length, Math.round((LEVELS.length - primaryLevels) * 1.2));
    assert.ok(teachers.every(t => t.hourlyRate === 150 && t.fixedSalary === 0));
    for (const payment of data.teacherPayments) {
      assert.ok(dues.salaryEarnedOn(payment.month, 2026, payment.date) && payment.date <= '2027-02-28');
      const teacher = data.teachers.find(t => t.id === payment.teacherId);
      if (teacher.role === 'أستاذ') assert.equal(payment.salaryDue, payment.hours * 150);
    }
    assert.ok(data.teacherAdvances.length > 0 && data.expenses.length > 0 && data.exams.length > data.students.length);
    assert.ok(data.expenses.every(e => e.date <= '2027-02-28'));
    db.close();

    // Running it again rebuilds the same database after backing up the previous one.
    const second = await seedTesting(dir);
    assert.deepEqual(second.counts, first.counts);
    assert.notEqual(second.backupPath, first.backupPath);
    db.init(dir, { mode: 'test' }); assert.equal(db.getData().students.length, first.counts.students);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
