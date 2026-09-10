const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const dues = require('../public/fees.js');
const db = require('../db');

const dirs = [];
function temp() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-fees-')); dirs.push(dir); return dir; }
afterEach(() => { db.close(); for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

const settings = { schoolYear: '2026 / 2027' };
const base = { name: 'طالب', schoolNo: 'S1', nni: '1234567890', gender: 'ذكر', className: '6AF' };
const amounts = ledger => ledger.rows.map(row => [row.month, row.amount, row.paid, row.remaining]);

test('charges only cover the months between enrolment and departure', () => {
  const midYear = { registrationDate: '2027-02-10', registrationFee: 5000, monthlyFee: 10000 };
  const months = dues.chargesFor(midYear, settings).map(c => c.month);
  assert.deepEqual(months, [dues.REGISTRATION, 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو']);
  // The old behaviour billed all nine months: 5000 + 9 * 10000.
  assert.equal(dues.ledgerFor(midYear, [], settings).totalDue, 55000);

  const left = { ...midYear, leaveDate: '2027-04-03', status: 'منقطع' };
  assert.deepEqual(dues.chargesFor(left, settings).map(c => c.month), [dues.REGISTRATION, 'فبراير', 'مارس', 'أبريل']);
  assert.equal(dues.ledgerFor(left, [], settings).totalDue, 35000);

  const early = { registrationDate: '2026-09-01', registrationFee: 0, monthlyFee: 1000 };
  assert.equal(dues.chargesFor(early, settings).length, 1 + dues.MONTHS.length, 'enrolment before October covers the whole year');
});

test('a payment is a credit allocated to the oldest unpaid charge first', () => {
  const student = { registrationDate: '2026-10-01', registrationFee: 0, monthlyFee: 10000 };
  // One payment recorded against October that actually covers three months.
  const ledger = dues.ledgerFor(student, [{ id: 1, month: 'أكتوبر', amount: 30000, date: '2026-10-05' }], settings);
  assert.deepEqual(amounts(ledger).slice(0, 5), [
    [dues.REGISTRATION, 0, 0, 0],
    ['أكتوبر', 10000, 10000, 0],
    ['نوفمبر', 10000, 10000, 0],
    ['ديسمبر', 10000, 10000, 0],
    ['يناير', 10000, 0, 10000]
  ]);
  assert.equal(ledger.credit, 0);
  // Nine months at 10000; three are settled, so six remain.
  assert.equal(ledger.outstanding, 60000, 'no longer overstated by the two months paid in advance');
  assert.equal(ledger.totalPaid, 30000);
});

test('surplus beyond every charge stays on the account as a credit', () => {
  const student = { registrationDate: '2026-10-01', registrationFee: 1000, monthlyFee: 1000 };
  const ledger = dues.ledgerFor(student, [{ id: 1, amount: 12000, date: '2026-10-05' }], settings);
  assert.equal(ledger.totalDue, 10000);
  assert.equal(ledger.outstanding, 0);
  assert.equal(ledger.credit, 2000);
  assert.equal(ledger.totalPaid, 12000);
});

test('allocation follows payment date then id, and records which invoice paid what', () => {
  const student = { registrationDate: '2026-10-01', registrationFee: 0, monthlyFee: 5000 };
  const ledger = dues.ledgerFor(student, [
    { id: 2, invoiceNo: 'F-000002', amount: 6000, date: '2026-11-02' },
    { id: 1, invoiceNo: 'F-000001', amount: 3000, date: '2026-10-02' }
  ], settings);
  const october = ledger.byMonth.get('أكتوبر'), november = ledger.byMonth.get('نوفمبر');
  assert.deepEqual(october.allocations.map(a => [a.invoiceNo, a.amount]), [['F-000001', 3000], ['F-000002', 2000]]);
  assert.deepEqual(november.allocations.map(a => [a.invoiceNo, a.amount]), [['F-000002', 4000]]);
  assert.equal(november.remaining, 1000);
});

test('decimal amounts allocate without leaving rounding dust', () => {
  const student = { registrationDate: '2026-10-01', registrationFee: 0, monthlyFee: 33.33 };
  const ledger = dues.ledgerFor(student, [{ id: 1, amount: 99.99, date: '2026-10-01' }], settings);
  assert.equal(ledger.byMonth.get('ديسمبر').remaining, 0);
  assert.equal(ledger.byMonth.get('يناير').paid, 0);
  assert.equal(ledger.credit, 0);
});

test('a charge keeps the fee that applied when it fell due', () => {
  const student = {
    registrationDate: '2026-10-01', registrationFee: 0, monthlyFee: 15000,
    feeHistory: [{ fromMonth: 'أكتوبر', monthlyFee: 10000 }, { fromMonth: 'يناير', monthlyFee: 15000 }]
  };
  const ledger = dues.ledgerFor(student, [], settings);
  assert.equal(ledger.byMonth.get('أكتوبر').amount, 10000);
  assert.equal(ledger.byMonth.get('ديسمبر').amount, 10000, 'a January rise must not reprice December');
  assert.equal(ledger.byMonth.get('يناير').amount, 15000);
  assert.equal(ledger.totalDue, 3 * 10000 + 6 * 15000);
  // Records with no history fall back to the single current fee.
  assert.equal(dues.ledgerFor({ registrationDate: '2026-10-01', monthlyFee: 8000 }, [], settings).byMonth.get('أكتوبر').amount, 8000);
});

test('raising the fee opens a new period and leaves billed months untouched', () => {
  const dir = temp(); db.init(dir);
  const student = db.addStudent({ ...base, registrationDate: '2026-10-01', monthlyFee: 10000, registrationFee: 2000 });
  assert.deepEqual(student.feeHistory, [{ fromMonth: 'أكتوبر', monthlyFee: 10000, date: '2026-10-01' }]);
  assert.equal(student.status, dues.ACTIVE_STATUS);

  const raised = db.updateStudentFees(student.id, { registrationFee: 2000, monthlyFee: 15000, effectiveFrom: 'يناير' });
  assert.deepEqual(raised.feeHistory.map(p => [p.fromMonth, p.monthlyFee]), [['أكتوبر', 10000], ['يناير', 15000]]);
  assert.equal(raised.monthlyFee, 15000, 'the current fee tracks the latest period');
  assert.equal(dues.ledgerFor(raised, [], settings).byMonth.get('ديسمبر').amount, 10000);

  // Correcting the same period amends it instead of stacking a duplicate.
  const corrected = db.updateStudentFees(student.id, { registrationFee: 2000, monthlyFee: 16000, effectiveFrom: 'يناير' });
  assert.deepEqual(corrected.feeHistory.map(p => [p.fromMonth, p.monthlyFee]), [['أكتوبر', 10000], ['يناير', 16000]]);
});

test('a record with no fee history keeps its old fee on months already billed', () => {
  const dir = temp(); db.init(dir);
  const student = db.addStudent({ ...base, registrationDate: '2026-10-01', monthlyFee: 10000 });
  // An existing SQLite database skips the JSON backfill, so strip the history the
  // way such a record actually looks on disk.
  db.close();
  const raw = new DatabaseSync(path.join(dir, 'database', 'school-data.sqlite'));
  const { record } = raw.prepare('SELECT record FROM students WHERE id = ?').get(student.id);
  const stripped = JSON.parse(record);
  delete stripped.feeHistory;
  raw.prepare('UPDATE students SET record = ? WHERE id = ?').run(JSON.stringify(stripped), student.id);
  raw.close();
  db.init(dir);
  assert.equal(db.getData().students[0].feeHistory, undefined, 'the record really has no history');

  const updated = db.updateStudentFees(student.id, { registrationFee: 0, monthlyFee: 20000, effectiveFrom: 'مارس' });
  assert.deepEqual(updated.feeHistory.map(p => [p.fromMonth, p.monthlyFee]), [['أكتوبر', 10000], ['مارس', 20000]]);
  assert.equal(dues.ledgerFor(updated, [], settings).byMonth.get('فبراير').amount, 10000);
});

test('departure needs a date and a status, and the date cannot precede enrolment', () => {
  const dir = temp(); db.init(dir);
  const student = db.addStudent({ ...base, registrationDate: '2026-10-01' });
  const edit = extra => db.updateStudent(student.id, { ...base, registrationDate: '2026-10-01', ...extra });
  assert.throws(() => edit({ status: 'منقطع' }), /حدد تاريخ المغادرة/);
  assert.throws(() => edit({ leaveDate: '2027-01-05' }), /اختر حالة المغادرة/);
  assert.throws(() => edit({ status: 'مطرود', leaveDate: '2027-01-05' }), /حالة الطالب غير صحيحة/);
  assert.throws(() => edit({ status: 'منقطع', leaveDate: '2026-09-01' }), /بعد تاريخ التسجيل/);
  assert.throws(() => edit({ status: 'منقطع', leaveDate: '05-01-2027' }), /YYYY-MM-DD/);
  const left = edit({ status: 'محوَّل', leaveDate: '2027-01-05' });
  assert.equal(left.leaveDate, '2027-01-05');
  db.close(); db.init(dir);
  assert.equal(db.getData().students[0].status, 'محوَّل', 'the departure survives a restart');
});

test('a JSON database migrates to fee history, active status and no departure', () => {
  const dir = temp();
  fs.mkdirSync(path.join(dir, 'database'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'database', 'school-data.json'), JSON.stringify({
    students: [{ id: 1, name: 'قديم', schoolNo: 'S9', nni: '9999999999', className: '6AF', gender: 'ذكر', registrationDate: '2027-01-12', monthlyFee: 7000, registrationFee: 0 }]
  }));
  db.init(dir);
  const student = db.getData().students[0];
  assert.deepEqual(student.feeHistory, [{ fromMonth: 'يناير', monthlyFee: 7000, date: '2027-01-12' }]);
  assert.equal(student.status, dues.ACTIVE_STATUS);
  assert.equal(student.leaveDate, '');
  assert.equal(dues.ledgerFor(student, [], settings).totalDue, 6 * 7000, 'January enrolment is not billed for October to December');
});

test('each month falls due on the registration day within that month', () => {
  const student = { registrationDate: '2027-02-10', registrationFee: 0, monthlyFee: 12000 };
  const dates = dues.chargesFor(student, settings).map(c => [c.month, c.dueDate]);
  assert.deepEqual(dates, [
    [dues.REGISTRATION, '2027-02-10'], ['فبراير', '2027-02-10'], ['مارس', '2027-03-10'],
    ['أبريل', '2027-04-10'], ['مايو', '2027-05-10'], ['يونيو', '2027-06-10']
  ]);
  const monthEnd = { registrationDate: '2026-10-31', registrationFee: 0, monthlyFee: 100 };
  const november = dues.chargesFor(monthEnd, settings).find(c => c.month === 'نوفمبر');
  assert.equal(november.dueDate, '2026-11-30', 'the day is clamped to the length of the month');
});

test('a discount reduces the monthly fee but never the registration fee', () => {
  const dir = temp(); db.init(dir);
  const student = db.addStudent({ ...base, registrationDate: '2026-10-01', monthlyFee: 10000, registrationFee: 4000 });
  assert.equal(student.discountType, '');

  const half = db.updateStudentFees(student.id, { registrationFee: 4000, monthlyFee: 10000, effectiveFrom: 'أكتوبر', discountType: 'percent', discountValue: 25, discountReason: 'منحة' });
  const october = dues.ledgerFor(half, [], settings).byMonth.get('أكتوبر');
  assert.deepEqual([october.gross, october.discount, october.amount], [10000, 2500, 7500]);
  assert.equal(dues.ledgerFor(half, [], settings).byMonth.get(dues.REGISTRATION).amount, 4000, 'registration is not discounted');
  assert.equal(dues.ledgerFor(half, [], settings).totalDiscount, 9 * 2500);
  assert.equal(half.discountReason, 'منحة');

  const fixed = db.updateStudentFees(student.id, { registrationFee: 4000, monthlyFee: 10000, effectiveFrom: 'أكتوبر', discountType: 'amount', discountValue: 3000 });
  assert.equal(dues.ledgerFor(fixed, [], settings).byMonth.get('أكتوبر').amount, 7000);
  assert.equal(fixed.discountReason, '', 'the reason is cleared with the discount type');

  // A discount larger than the fee zeroes the charge instead of going negative.
  const capped = db.updateStudentFees(student.id, { registrationFee: 4000, monthlyFee: 10000, effectiveFrom: 'أكتوبر', discountType: 'amount', discountValue: 99999 });
  assert.equal(dues.ledgerFor(capped, [], settings).byMonth.get('أكتوبر').amount, 0);

  const bad = extra => () => db.updateStudentFees(student.id, { registrationFee: 4000, monthlyFee: 10000, effectiveFrom: 'أكتوبر', ...extra });
  assert.throws(bad({ discountType: 'نسبة' }), /نوع الخصم/);
  assert.throws(bad({ discountType: 'percent', discountValue: 140 }), /100/);
  assert.throws(bad({ discountType: 'percent', discountValue: -5 }), /لا يقل عن صفر/);
  assert.throws(bad({ discountType: 'amount', discountValue: 0 }), /أدخل قيمة الخصم/);

  const cleared = db.updateStudentFees(student.id, { registrationFee: 4000, monthlyFee: 10000, effectiveFrom: 'أكتوبر', discountType: '' });
  assert.equal(dues.ledgerFor(cleared, [], settings).byMonth.get('أكتوبر').amount, 10000);
});

test('a payment cannot exceed what the account still owes', () => {
  const dir = temp(); db.init(dir);
  const student = db.addStudent({ ...base, registrationDate: '2026-10-01', monthlyFee: 1000, registrationFee: 0 });
  const outstanding = dues.ledgerFor(student, [], settings).totalDue;
  assert.equal(outstanding, 9000);

  assert.throws(() => db.addStudentPayment({ studentId: student.id, month: 'أكتوبر', amount: 9001 }), /المتبقي على الطالب هو 9000/);
  const payment = db.addStudentPayment({ studentId: student.id, month: 'أكتوبر', amount: 9000 });
  assert.throws(() => db.addStudentPayment({ studentId: student.id, month: 'نوفمبر', amount: 1 }), /لا توجد مستحقات/);

  // Editing a payment measures the remainder without counting that payment twice.
  assert.doesNotThrow(() => db.updateStudentPayment(payment.id, { month: 'أكتوبر', amount: 8000 }));
  assert.throws(() => db.updateStudentPayment(payment.id, { month: 'أكتوبر', amount: 9500 }), /المتبقي على الطالب هو 9000/);
});

test('the data endpoint payload leaves exams to their own endpoint', () => {
  const dir = temp(); db.init(dir);
  const student = db.addStudent({ ...base });
  db.saveExamSettings({ subjectTemplates: [{ department: '6AF', subjects: [{ id: 'ar', name: 'عربية' }] }] });
  db.saveExamRecord({ studentId: student.id, department: '6AF', examNo: 1, results: [{ subjectId: 'ar', score: 18 }] });

  const core = db.getCoreData();
  assert.equal('exams' in core, false);
  assert.equal('examSettings' in core, false);
  assert.equal(core.students.length, 1, 'everything the interface still needs is present');
  assert.equal(core.settings.schoolName, 'مدرسة مكارم الأخلاق الحرة');
  // The scrypt hash must never leave the server: the browser only needs publicSettings().
  assert.equal('passwordHash' in core.settings, false, 'the password hash stays on the server');
  // The records are untouched and still reachable where the interface reads them.
  assert.equal(db.getExamData().exams.length, 1);
  assert.equal(db.getData().exams.length, 1);
});

test('writing one collection leaves every other collection intact', () => {
  const dir = temp(); db.init(dir);
  const student = db.addStudent({ ...base });
  const teacher = db.addTeacher({ name: 'مدرس', fixedSalary: 500 });
  db.addExpense({ category: 'كتب', amount: 25 });
  db.saveExamRecord({ studentId: student.id, department: '6AF', examNo: 1, results: [] });
  const before = db.getData();

  db.addStudentPayment({ studentId: student.id, month: 'أكتوبر', amount: 10 });
  db.close(); db.init(dir);
  const after = db.getData();
  for (const key of ['teachers', 'expenses', 'exams', 'departments', 'settings']) {
    assert.deepEqual(after[key], before[key], `${key} survived a students-only write`);
  }
  assert.equal(after.studentPayments.length, before.studentPayments.length + 1);
  assert.equal(after.teachers[0].id, teacher.id);
});

test('one vocabulary covers every dues state, and the filters reuse it', () => {
  const at = (charge, today) => dues.feeStatusOf(charge, today);
  assert.deepEqual(at(null, '2027-01-15').slice(0, 2), ['خارج فترة القيد', 'status-exempt']);
  assert.deepEqual(at({ amount: 0, paid: 0, remaining: 0, dueDate: '2026-10-01' }, '2027-01-15').slice(0, 2),
    ['بلا رسوم', 'status-exempt']);
  assert.deepEqual(at({ amount: 100, paid: 100, remaining: 0, dueDate: '2026-10-01' }, '2027-01-15').slice(0, 2),
    ['مسدَّد بالكامل', 'status-paid']);
  // Past the due date the row says «متأخر», the same word the filter uses.
  assert.deepEqual(at({ amount: 100, paid: 40, remaining: 60, dueDate: '2026-10-01' }, '2027-01-15').slice(0, 2),
    ['متأخر', 'status-unpaid']);
  assert.deepEqual(at({ amount: 100, paid: 40, remaining: 60, dueDate: '2027-05-01' }, '2027-01-15').slice(0, 2),
    ['عليه متبقٍّ', 'status-partial']);
  assert.deepEqual(at({ amount: 100, paid: 0, remaining: 100, dueDate: '2027-05-01' }, '2027-01-15').slice(0, 2),
    ['لم يُدفع بعد', 'status-unpaid']);

  // Every filter label is either «الكل» or a label a row can actually show.
  const rowLabels = new Set(Object.values(dues.FEE_STATUS_LABELS));
  for (const filter of dues.FEE_FILTERS) {
    assert.ok(filter.value === '' || rowLabels.has(filter.label), `${filter.label} matches a row label`);
  }
  assert.equal(new Set(Object.values(dues.FEE_STATUS_LABELS)).size,
    Object.keys(dues.FEE_STATUS_LABELS).length, 'no two states share a word');
});

test('fee periods read back as ranges, and an edit can be previewed or undone', () => {
  const student = { registrationDate: '2026-10-01', registrationFee: 5000, monthlyFee: 3500,
    feeHistory: [{ fromMonth: 'أكتوبر', monthlyFee: 3000 }, { fromMonth: 'يناير', monthlyFee: 3500 }] };
  assert.deepEqual(dues.feePeriodRanges(student).map(r => [r.fromMonth, r.toMonth, r.monthCount, r.monthlyFee]),
    [['أكتوبر', 'ديسمبر', 3, 3000], ['يناير', 'يونيو', 6, 3500]]);

  // The preview copy must match what the server writes, or it would mislead.
  const edited = dues.withFeePeriod(student, 'مارس', 4000, settings);
  assert.deepEqual(edited.feeHistory.map(p => [p.fromMonth, p.monthlyFee]),
    [['أكتوبر', 3000], ['يناير', 3500], ['مارس', 4000]]);
  assert.equal(edited.monthlyFee, 4000);
  assert.equal(dues.monthlyFeeFor(edited, 'فبراير'), 3500);
  assert.equal(dues.monthlyFeeFor(edited, 'أبريل'), 4000);
  // Re-editing an existing period replaces it instead of stacking a second one.
  assert.equal(dues.withFeePeriod(edited, 'يناير', 3600, settings).feeHistory.length, 3);

  // A record with no history keeps its old fee on the months already billed.
  const legacy = { registrationDate: '2026-10-01', monthlyFee: 2000, feeHistory: [] };
  assert.deepEqual(dues.withFeePeriod(legacy, 'يناير', 2500, settings).feeHistory.map(p => [p.fromMonth, p.monthlyFee]),
    [['أكتوبر', 2000], ['يناير', 2500]]);

  // Undoing a period returns its months to the fee before it.
  const undone = dues.withoutFeePeriod(edited, 'مارس');
  assert.deepEqual(undone.feeHistory.map(p => p.fromMonth), ['أكتوبر', 'يناير']);
  assert.equal(dues.monthlyFeeFor(undone, 'أبريل'), 3500);
});

test('a fee period can be removed, but never the last one', () => {
  const dir = temp(); db.init(dir);
  const student = db.addStudent({ ...base, registrationDate: '2026-10-01', registrationFee: 5000, monthlyFee: 3000 });
  db.updateStudentFees(student.id, { registrationFee: 5000, monthlyFee: 4000, effectiveFrom: 'يناير' });
  const withTwo = db.getData().students.find(s => s.id === student.id);
  assert.equal(withTwo.feeHistory.length, 2);
  assert.equal(dues.monthlyFeeFor(withTwo, 'مارس'), 4000);

  db.removeStudentFeePeriod(student.id, 'يناير');
  const withOne = db.getData().students.find(s => s.id === student.id);
  assert.deepEqual(withOne.feeHistory.map(p => p.fromMonth), ['أكتوبر']);
  // The record's headline fee follows the last period that survives.
  assert.equal(withOne.monthlyFee, 3000);
  assert.equal(dues.monthlyFeeFor(withOne, 'مارس'), 3000);

  assert.throws(() => db.removeStudentFeePeriod(student.id, 'أكتوبر'), /الوحيدة/);
  assert.throws(() => db.removeStudentFeePeriod(student.id, 'مايو'), /لا توجد فترة/);
});
