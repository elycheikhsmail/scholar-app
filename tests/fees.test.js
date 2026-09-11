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

// Most existing engine tests inspect the completed school year. Individual
// accrual tests override this date to exercise the current-balance rule.
const settings = { schoolYear: '2026 / 2027', asOf: '2027-06-30' };
const base = { name: 'طالب', schoolNo: 'S1', nni: '1234567890', gender: 'ذكر', className: '6AF' };
// Fees belong to the school, not to the student: the engine reads the
// registration fee from the settings and the monthly fee from the level.
const withFees = (registrationFee, monthlyFee, extra = {}) =>
  ({ ...settings, registrationFee, departments: [{ name: '6AF', monthlyFee }], ...extra });
const enrolled = extra => ({ className: '6AF', ...extra });
const amounts = ledger => ledger.rows.map(row => [row.month, row.amount, row.paid, row.remaining]);

test('charges only cover the months between enrolment and departure', () => {
  const school = withFees(5000, 10000);
  const midYear = enrolled({ registrationDate: '2027-02-10' });
  const months = dues.chargesFor(midYear, school).map(c => c.month);
  assert.deepEqual(months, [dues.REGISTRATION, 'يونيو', 'فبراير', 'مارس', 'أبريل', 'مايو']);
  // The old behaviour billed all nine months: 5000 + 9 * 10000.
  assert.equal(dues.ledgerFor(midYear, [], school).totalDue, 55000);

  const left = { ...midYear, leaveDate: '2027-04-03', status: 'منقطع' };
  assert.deepEqual(dues.chargesFor(left, school).map(c => c.month), [dues.REGISTRATION, 'يونيو', 'فبراير', 'مارس', 'أبريل']);
  assert.equal(dues.ledgerFor(left, [], school).totalDue, 45000);

  const early = enrolled({ registrationDate: '2026-09-01' });
  assert.equal(dues.chargesFor(early, withFees(0, 1000)).length, 1 + dues.MONTHS.length, 'enrolment before October covers the whole year');
});

test('current balance excludes future months while keeping them available for advance payment', () => {
  const school = withFees(3000, 10000);
  const student = enrolled({ registrationDate:'2026-09-01' });
  const september = dues.ledgerFor(student, [], { ...school, asOf:'2026-09-10' });
  assert.equal(september.totalDue, 13000, 'registration and the final June fee are immediately due');
  assert.equal(september.outstanding, 13000);
  assert.equal(september.scheduledOutstanding, 93000, 'the school-year schedule remains available for prepayment');
  assert.deepEqual(september.accruedRows.map(row=>row.month), [dues.REGISTRATION,'يونيو']);
  assert.ok(september.byMonth.has('نوفمبر'), 'a future month can still be selected and paid');

  const november = dues.ledgerFor(student, [], { ...school, asOf:'2026-11-01' });
  assert.deepEqual(november.accruedRows.map(row=>row.month), [dues.REGISTRATION,'يونيو','أكتوبر','نوفمبر']);
  assert.equal(november.totalDue, 33000, 'June stays due alongside monthly fees due on their first day');

  const prepaid = dues.ledgerFor(student,[
    {id:1,month:dues.REGISTRATION,amount:3000,date:'2026-09-01'},
    {id:2,month:'أكتوبر',amount:30000,date:'2026-09-10'}
  ],{ ...school, asOf:'2026-09-10' });
  assert.equal(prepaid.outstanding,0);
  assert.equal(prepaid.totalPaid,33000);
  assert.equal(prepaid.scheduledOutstanding,60000);
  assert.equal(dues.outstandingThrough(prepaid,'نوفمبر'),0,'a future receipt includes only the balance through its selected month');
});

test('payments clear compulsory June before later monthly fees', () => {
  const student=enrolled({registrationDate:'2026-09-01'});
  const ledger=dues.ledgerFor(student,[
    {id:1,month:'أكتوبر',amount:13000,date:'2026-09-01'},
    {id:2,month:'نوفمبر',amount:3000,date:'2026-09-05'},
    {id:3,month:'نوفمبر',amount:3000,date:'2026-09-10'}
  ],withFees(0,13000,{asOf:'2026-09-10'}));
  const june=ledger.byMonth.get('يونيو'), october=ledger.byMonth.get('أكتوبر'), november=ledger.byMonth.get('نوفمبر');
  assert.deepEqual([june.amount,june.paid,june.remaining],[13000,13000,0]);
  assert.deepEqual([october.amount,october.paid,october.remaining],[13000,6000,7000]);
  assert.deepEqual([november.amount,november.paid,november.remaining],[13000,0,13000]);
  assert.equal(ledger.outstanding,0,'future November is not current September debt');
  assert.equal(dues.outstandingThrough(ledger,'نوفمبر'),20000,'the balance through November includes October and November after June');
  assert.equal(dues.outstandingThrough(ledger,'ديسمبر'),33000,'later untouched months are included only when explicitly selected');
});

test('a payment is a credit allocated to the oldest unpaid charge first', () => {
  const student = enrolled({ registrationDate: '2026-10-01' });
  // One payment recorded against October that actually covers three months.
  const ledger = dues.ledgerFor(student, [{ id: 1, month: 'أكتوبر', amount: 30000, date: '2026-10-05' }], withFees(0, 10000));
  assert.deepEqual(amounts(ledger).slice(0, 5), [
    [dues.REGISTRATION, 0, 0, 0],
    ['يونيو', 10000, 10000, 0],
    ['أكتوبر', 10000, 10000, 0],
    ['نوفمبر', 10000, 10000, 0],
    ['ديسمبر', 10000, 0, 10000]
  ]);
  assert.equal(ledger.credit, 0);
  // Nine months at 10000; three are settled, so six remain.
  assert.equal(ledger.outstanding, 60000, 'no longer overstated by the two months paid in advance');
  assert.equal(ledger.totalPaid, 30000);
});

test('surplus beyond every charge stays on the account as a credit', () => {
  const student = enrolled({ registrationDate: '2026-10-01' });
  const ledger = dues.ledgerFor(student, [{ id: 1, amount: 12000, date: '2026-10-05' }], withFees(1000, 1000));
  assert.equal(ledger.totalDue, 10000);
  assert.equal(ledger.outstanding, 0);
  assert.equal(ledger.credit, 2000);
  assert.equal(ledger.totalPaid, 12000);
});

test('allocation follows payment date then id, and records which invoice paid what', () => {
  const student = enrolled({ registrationDate: '2026-10-01' });
  const ledger = dues.ledgerFor(student, [
    { id: 2, invoiceNo: 'F-000002', amount: 6000, date: '2026-11-02' },
    { id: 1, invoiceNo: 'F-000001', amount: 3000, date: '2026-10-02' }
  ], withFees(0, 5000));
  const june = ledger.byMonth.get('يونيو'), october = ledger.byMonth.get('أكتوبر'), november = ledger.byMonth.get('نوفمبر');
  assert.deepEqual(june.allocations.map(a => [a.invoiceNo, a.amount]), [['F-000001', 3000], ['F-000002', 2000]]);
  assert.deepEqual(october.allocations.map(a => [a.invoiceNo, a.amount]), [['F-000002', 4000]]);
  assert.equal(october.remaining, 1000);
  assert.equal(november.paid, 0);
});

test('decimal amounts allocate without leaving rounding dust', () => {
  const student = enrolled({ registrationDate: '2026-10-01' });
  const ledger = dues.ledgerFor(student, [{ id: 1, amount: 99.99, date: '2026-10-01' }], withFees(0, 33.33));
  assert.equal(ledger.byMonth.get('نوفمبر').remaining, 0);
  assert.equal(ledger.byMonth.get('ديسمبر').paid, 0);
  assert.equal(ledger.credit, 0);
});

test('every charge reads the school fee of the student level', () => {
  const student = enrolled({ registrationDate: '2026-10-01' });
  const ledger = dues.ledgerFor(student, [], withFees(2000, 10000));
  assert.equal(ledger.byMonth.get(dues.REGISTRATION).amount, 2000);
  assert.equal(ledger.byMonth.get('أكتوبر').amount, 10000);
  assert.equal(ledger.byMonth.get('يونيو').amount, 10000, 'the monthly fee is the same in every month');
  assert.equal(ledger.totalDue, 2000 + 9 * 10000);

  // Correcting the fee is meant to reach the whole year, including months
  // already billed: that is what makes the settings the only place to set it.
  assert.equal(dues.ledgerFor(student, [], withFees(2000, 12000)).totalDue, 2000 + 9 * 12000);

  // A level the settings do not price falls back to the default fee.
  const unknown = { registrationDate: '2026-10-01', className: 'قسم غير معروف' };
  assert.equal(dues.monthlyFeeFor(unknown, withFees(0, 10000, { defaultMonthlyFee: 4000 })), 4000);
  assert.equal(dues.monthlyFeeFor(student, withFees(0, 10000, { defaultMonthlyFee: 4000 })), 10000);
  // A student record carrying its own old fee cannot outvote the settings.
  assert.equal(dues.monthlyFeeFor({ ...student, monthlyFee: 999 }, withFees(0, 10000)), 10000);
  assert.equal(dues.registrationFeeFor(withFees(2000, 0)), 2000);
});

test('raising a level fee reprices its students, and the record keeps no fee of its own', () => {
  const dir = temp(); db.init(dir);
  db.updateFeeSettings({ registrationFee: 200, defaultMonthlyFee: 0 });
  const department = db.getDepartments().find(d => d.name === '6AF');
  const student = db.addStudent({ ...base, registrationDate: '2026-10-01' });
  for (const field of ['monthlyFee', 'registrationFee', 'feeHistory']) {
    assert.equal(field in student, false, `the record no longer carries ${field}`);
  }
  const school = () => ({ ...db.publicSettings(), asOf: settings.asOf, departments: db.getDepartments() });
  assert.equal(dues.ledgerFor(student, [], school()).totalDue, 200 + 9 * department.monthlyFee);

  db.updateDepartment(department.id, { name: '6AF', monthlyFee: 20000 });
  assert.equal(dues.ledgerFor(student, [], school()).totalDue, 200 + 9 * 20000, 'a level fee reaches every month at once');

  db.updateFeeSettings({ registrationFee: 500, defaultMonthlyFee: 0 });
  assert.equal(dues.ledgerFor(student, [], school()).byMonth.get(dues.REGISTRATION).amount, 500);
  assert.throws(() => db.updateFeeSettings({ registrationFee: -1, defaultMonthlyFee: 0 }), /لا تقل عن صفر/);
  assert.throws(() => db.updateFeeSettings({ registrationFee: '', defaultMonthlyFee: 0 }), /لا تقل عن صفر/);
});

test('a record that still carries its own fee loses it when the database is opened', () => {
  const dir = temp(); db.init(dir);
  const student = db.addStudent({ ...base, registrationDate: '2026-10-01' });
  db.close();
  const raw = new DatabaseSync(path.join(dir, 'database', 'school-data.sqlite'));
  const { record } = raw.prepare('SELECT record FROM students WHERE id = ?').get(student.id);
  raw.prepare('UPDATE students SET record = ? WHERE id = ?').run(
    JSON.stringify({ ...JSON.parse(record), monthlyFee: 3000, registrationFee: 7000,
      feeHistory: [{ fromMonth: 'أكتوبر', monthlyFee: 3000 }] }), student.id);
  raw.close();

  db.init(dir);
  const migrated = db.getData().students[0];
  assert.deepEqual([migrated.monthlyFee, migrated.registrationFee, migrated.feeHistory], [undefined, undefined, undefined]);
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

test('a JSON database migrates to school fees, active status and no departure', () => {
  const dir = temp();
  fs.mkdirSync(path.join(dir, 'database'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'database', 'school-data.json'), JSON.stringify({
    students: [{ id: 1, name: 'قديم', schoolNo: 'S9', nni: '9999999999', className: '6AF', gender: 'ذكر', registrationDate: '2027-01-12', monthlyFee: 7000, registrationFee: 0 }]
  }));
  db.init(dir);
  const student = db.getData().students[0];
  assert.equal(student.monthlyFee, undefined, 'the fee it used to carry is dropped for the school fee');
  assert.equal(student.status, dues.ACTIVE_STATUS);
  assert.equal(student.leaveDate, '');
  assert.equal(dues.ledgerFor(student, [], withFees(0, 7000)).totalDue, 6 * 7000, 'January enrolment is not billed for October to December');
});

test('monthly fees fall due on day one and June is due at registration', () => {
  const student = enrolled({ registrationDate: '2027-02-10' });
  const dates = dues.chargesFor(student, withFees(0, 12000)).map(c => [c.month, c.dueDate]);
  assert.deepEqual(dates, [
    [dues.REGISTRATION, '2027-02-10'], ['يونيو', '2027-02-10'], ['فبراير', '2027-02-01'],
    ['مارس', '2027-03-01'], ['أبريل', '2027-04-01'], ['مايو', '2027-05-01']
  ]);
  const monthEnd = enrolled({ registrationDate: '2026-10-31' });
  const november = dues.chargesFor(monthEnd, withFees(0, 100)).find(c => c.month === 'نوفمبر');
  assert.equal(november.dueDate, '2026-11-01');
});

test('a discount reduces the monthly fee but never the registration fee', () => {
  const dir = temp(); db.init(dir);
  db.updateFeeSettings({ registrationFee: 4000, defaultMonthlyFee: 0 });
  const department = db.getDepartments().find(d => d.name === '6AF');
  db.updateDepartment(department.id, { name: '6AF', monthlyFee: 10000 });
  const student = db.addStudent({ ...base, registrationDate: '2026-10-01' });
  assert.equal(student.discountType, '');
  const school = { ...settings, registrationFee: 4000, departments: [{ name: '6AF', monthlyFee: 10000 }] };

  const half = db.updateStudentDiscount(student.id, { discountType: 'percent', discountValue: 25, discountReason: 'منحة' });
  const october = dues.ledgerFor(half, [], school).byMonth.get('أكتوبر');
  assert.deepEqual([october.gross, october.discount, october.amount], [10000, 2500, 7500]);
  assert.equal(dues.ledgerFor(half, [], school).byMonth.get(dues.REGISTRATION).amount, 4000, 'registration is not discounted');
  assert.equal(dues.ledgerFor(half, [], school).totalDiscount, 9 * 2500);
  assert.equal(half.discountReason, 'منحة');

  const fixed = db.updateStudentDiscount(student.id, { discountType: 'amount', discountValue: 3000 });
  assert.equal(dues.ledgerFor(fixed, [], school).byMonth.get('أكتوبر').amount, 7000);
  assert.equal(fixed.discountReason, '', 'the reason is cleared with the discount type');

  // A discount larger than the fee zeroes the charge instead of going negative.
  const capped = db.updateStudentDiscount(student.id, { discountType: 'amount', discountValue: 99999 });
  assert.equal(dues.ledgerFor(capped, [], school).byMonth.get('أكتوبر').amount, 0);

  const bad = extra => () => db.updateStudentDiscount(student.id, extra);
  assert.throws(bad({ discountType: 'نسبة' }), /نوع الخصم/);
  assert.throws(bad({ discountType: 'percent', discountValue: 140 }), /100/);
  assert.throws(bad({ discountType: 'percent', discountValue: -5 }), /لا يقل عن صفر/);
  assert.throws(bad({ discountType: 'amount', discountValue: 0 }), /أدخل قيمة الخصم/);

  const cleared = db.updateStudentDiscount(student.id, { discountType: '' });
  assert.equal(dues.ledgerFor(cleared, [], school).byMonth.get('أكتوبر').amount, 10000);
});

test('a payment cannot exceed what the account still owes', () => {
  const dir = temp(); db.init(dir);
  db.updateFeeSettings({ registrationFee: 0, defaultMonthlyFee: 0 });
  const department = db.getDepartments().find(d => d.name === '6AF');
  db.updateDepartment(department.id, { name: '6AF', monthlyFee: 1000 });
  const student = db.addStudent({ ...base, registrationDate: '2026-10-01' });
  const outstanding = dues.ledgerFor(student, [], { ...settings, registrationFee: 0, departments: db.getDepartments() }).totalDue;
  assert.equal(outstanding, 9000);

  assert.throws(() => db.addStudentPayment({ studentId: student.id, month: 'أكتوبر', amount: 9001 }), /المتبقي على الطالب هو 9000/);
  const payment = db.addStudentPayment({ studentId: student.id, month: 'أكتوبر', amount: 9000 });
  assert.throws(() => db.addStudentPayment({ studentId: student.id, month: 'نوفمبر', amount: 1 }), /لا توجد مستحقات/);

  // Editing a payment measures the remainder without counting that payment twice.
  assert.doesNotThrow(() => db.updateStudentPayment(payment.id, { month: 'أكتوبر', amount: 8000 }));
  assert.throws(() => db.updateStudentPayment(payment.id, { month: 'أكتوبر', amount: 9500 }), /المتبقي على الطالب هو 9000/);
});

// What the fee form sends: one receipt per fee, weighed against the balance as
// a whole so a set that overshoots cannot slip through payment by payment.
test('a visit records one receipt per fee, and the batch is capped as a whole', () => {
  const dir = temp(); db.init(dir);
  db.updateFeeSettings({ registrationFee: 200, defaultMonthlyFee: 0 });
  const department = db.getDepartments().find(d => d.name === '6AF');
  db.updateDepartment(department.id, { name: '6AF', monthlyFee: 1000 });
  const student = db.addStudent({ ...base, registrationDate: '2026-10-01' });

  const payments = db.addStudentPayments({ studentId: student.id, date: '2026-10-05', entries: [
    { month: dues.REGISTRATION, amount: 200 },
    { month: 'أكتوبر', amount: 1000 },
    { month: 'نوفمبر', amount: 400 }
  ]});
  assert.deepEqual(payments.map(p => [p.month, p.amount, p.paymentType]), [
    [dues.REGISTRATION, 200, 'registration'], ['أكتوبر', 1000, 'monthly'], ['نوفمبر', 400, 'monthly']]);
  assert.deepEqual(payments.map(p => p.invoiceNo), ['F-000001', 'F-000002', 'F-000003']);
  assert.equal(db.getData().studentPayments.length, 3);

  const school = { ...settings, ...db.publicSettings(), departments: db.getDepartments() };
  const ledger = dues.ledgerFor(db.getData().students[0], db.getData().studentPayments, school);
  assert.equal(ledger.byMonth.get('يونيو').paid, 1000);
  assert.equal(ledger.byMonth.get('أكتوبر').paid, 400);
  assert.equal(ledger.byMonth.get('نوفمبر').paid, 0);
  assert.equal(ledger.outstanding, 200 + 9 * 1000 - 1600);

  // 7600 is left; a batch worth more is refused entirely, not partly written.
  assert.throws(() => db.addStudentPayments({ studentId: student.id, date: '2026-11-05', entries: [
    { month: 'نوفمبر', amount: 600 }, { month: 'ديسمبر', amount: 7100 }
  ]}), /المتبقي على الطالب/);
  assert.equal(db.getData().studentPayments.length, 3, 'nothing of a refused batch is written');

  assert.throws(() => db.addStudentPayments({ studentId: student.id, entries: [] }), /لم تُحدَّد أي دفعة/);
  assert.throws(() => db.addStudentPayments({ studentId: student.id, entries: [{ month: 'أكتوبر', amount: 0 }] }), /أدخل الشهر والمبلغ/);
  assert.throws(() => db.addStudentPayments({ studentId: student.id, entries: [{ month: 'سبتمبر', amount: 10 }] }), /اختر الرسم/);
  assert.throws(() => db.addStudentPayments({ studentId: 9999, entries: [{ month: 'أكتوبر', amount: 10 }] }), /الطالب غير موجود/);
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
