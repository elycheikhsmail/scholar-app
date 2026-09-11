// Rebuilds the TEST database (database/testing) with a full school year in
// progress, as it stands on the last day of February: 18 levels with the
// school's own fees, 20–50 pupils per level, receipts for the past months
// (some families still owing), staff with their salaries and advances,
// expenses and two exams. Production data is never touched.
//
// The application may stay open (every server operation re-reads the database
// inside its own transaction); reload the page afterwards.
//   node scripts/seed-testing.js            → database/testing of this folder
//   node scripts/seed-testing.js <dossier>  → another base directory (Electron: userData)
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const dues = require('../public/fees.js');

// Official levels and fees (scripts/official-fees.js); the age decides the
// pupils' birth years.
const { OFFICIAL_LEVELS } = require('./official-fees');
const AGES = { 'الحضانة': 3, 'التهجي': 4, 'التحضيري': 5, '2AF': 7, '3AF': 8, '4AF': 9, '5AF': 10, '6AF': 11, '1AS': 12, '2AS': 13, '3AS': 14, '4AS': 15, '5C': 16, '5D': 16, '6C': 17, '6D': 17, '7C': 18, '7D': 18 };
const LEVELS = OFFICIAL_LEVELS.map(level => ({ ...level, age: AGES[level.name] ?? 12 }));
const PRIMARY_STAGES = ['روضة', 'ابتدائي'];
const TEACHER_HOURLY_RATE = 150;   // أستاذ : paid by the hour
const INSTRUCTOR_SALARY = 6000;    // معلم : fixed monthly salary
const SUPPORT_STAFF = [['محاسب', 15000], ['مراقب', 10000], ['عامل يدوي', 5000]];
const SECONDARY_SUBJECTS = ['العربية', 'الرياضيات', 'الفرنسية', 'الفيزياء والكيمياء', 'العلوم الطبيعية', 'التاريخ والجغرافيا', 'التربية الإسلامية', 'الإنجليزية', 'الفلسفة'];
const PRIMARY_SUBJECTS = ['القرآن الكريم', 'العربية', 'الرياضيات', 'الفرنسية', 'التربية الإسلامية', 'العلوم'];

const BOYS = ['محمد', 'أحمد', 'سيدي', 'عبد الله', 'المختار', 'الحسن', 'إبراهيم', 'يوسف', 'محمد الأمين', 'عبد الرحمن', 'سيد أحمد', 'الشيخ', 'محمد محمود', 'عثمان', 'بابا', 'محمد فاضل', 'الطالب', 'يحيى', 'عبد القادر', 'حمود'];
const GIRLS = ['فاطمة', 'مريم', 'عائشة', 'خديجة', 'آمنة', 'زينب', 'سلمى', 'حفصة', 'أم كلثوم', 'لالة', 'توتو', 'النانة', 'خدي', 'فاطمتو', 'زينبو', 'صفية', 'رقية', 'أمينة', 'منى', 'مباركة'];
const FAMILIES = ['الشيخ', 'محمد الأمين', 'المختار', 'أحمد سالم', 'عبد الرحمن', 'الحسن', 'سيدي محمد', 'إبراهيم', 'باب', 'الطالب', 'حمود', 'سيد أحمد', 'محمد فاضل', 'عثمان', 'يحيى', 'الناجي', 'بوشارب', 'أعمر', 'الداه', 'محمدن'];
const CITIES = ['نواكشوط', 'نواذيبو', 'روصو', 'أطار', 'كيهيدي', 'ألاك', 'كيفة', 'النعمة', 'سيلبابي', 'الزويرات', 'تجكجة', 'بوتلميت'];
const EXPENSES = [
  ['إيجار', 'إيجار مبنى المدرسة', 'مالك العقار', 25000, 25000],
  ['كهرباء', 'فاتورة الكهرباء', 'صوملك', 3000, 6000],
  ['مياه', 'فاتورة الماء', 'الشركة الوطنية للماء', 800, 1500],
  ['أدوات مدرسية', 'طباشير وأقلام وأوراق', 'مكتبة النور', 1200, 4000],
  ['صيانة', 'إصلاح الطاولات والأبواب', 'ورشة النجارة', 500, 3500],
  ['نظافة', 'مواد التنظيف', 'سوق المدينة', 600, 1800],
  ['نقل', 'نقل التلاميذ ووقود الحافلة', 'سائق الحافلة', 4000, 9000],
  ['طباعة', 'طباعة الامتحانات والشهادات', 'مطبعة الأمل', 1500, 5000],
  ['اتصالات', 'الهاتف والإنترنت', 'موريتل', 1500, 2500]
];

// Deterministic generator: the same seed always produces the same database.
function random(seed) {
  let state = seed >>> 0;
  const next = () => { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: list => list[Math.floor(next() * list.length)],
    chance: probability => next() < probability
  };
}
const iso = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const clampDate = (date, min, max) => date < min ? min : date > max ? max : date;
const addDays = (date, days) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

// The school year comes from the settings; every date is placed inside it, and
// "today" is the last day of its February.
function calendar(settings) {
  const startYear = dues.startYearOf(settings.schoolYear);
  const today = dues.monthDate('فبراير', startYear, 31);
  const currentIndex = dues.MONTHS.indexOf('فبراير');
  return { startYear, today, currentIndex, dayOf: (month, day) => dues.monthDate(month, startYear, day) };
}

// The test database takes its settings and credentials from production when it
// is created, exactly as switching the mode from the interface does.
function openTestDatabase(baseDir) {
  const testFile = path.join(baseDir, 'database', 'testing', 'school-data.sqlite');
  let initialSettings;
  if (!fs.existsSync(testFile)) {
    db.init(baseDir);
    initialSettings = db.getData().settings;
  }
  db.init(baseDir, { mode: 'test', initialSettings });
}

// The levels of the school replace whatever the test database held, in the
// order they are taught (no pupil is left at that point, so all can go).
function replaceLevels() {
  for (const department of db.getDepartments()) db.deleteDepartment(department.id);
  for (const level of LEVELS) db.addDepartment({ name: level.name, monthlyFee: level.fee });
}

function seedStudents(rng, cal, options) {
  const feeSettings = { ...db.publicSettings(), departments: db.getDepartments() };
  const usedNni = new Set();
  const students = [];
  let serial = 0;
  for (const level of LEVELS.slice(0, options.levels)) {
    const count = rng.int(options.minPerLevel, options.maxPerLevel);
    for (let n = 0; n < count; n++) {
      serial++;
      const girl = rng.chance(0.5);
      const family = rng.pick(FAMILIES);
      let nni; do { nni = String(rng.int(1000000000, 9999999999)); } while (usedNni.has(nni)); usedNni.add(nni);
      // Most families enrol before October; a few arrive in November–January
      // and are charged only from their month.
      const late = rng.chance(0.1);
      const registrationDate = late ? cal.dayOf(rng.pick(['نوفمبر', 'ديسمبر', 'يناير']), rng.int(1, 25)) : addDays(iso(cal.startYear, 9, 15), rng.int(0, 25));
      // A handful have left the school; their charges stop at the leave date.
      const left = !late && rng.chance(0.03);
      const leaveDate = left ? cal.dayOf(rng.pick(['ديسمبر', 'يناير']), rng.int(1, 28)) : '';
      let student = db.addStudent({
        schoolNo: `T-${String(serial).padStart(4, '0')}`,
        name: `${girl ? rng.pick(GIRLS) : rng.pick(BOYS)} ${girl ? 'منت' : 'ولد'} ${family}`,
        gender: girl ? 'أنثى' : 'ذكر', nni,
        birthPlace: rng.pick(CITIES), birthDate: iso(cal.startYear - level.age, rng.int(1, 12), rng.int(1, 28)),
        guardianName: `${rng.pick(BOYS)} ولد ${family}`, guardianPhone: String(rng.int(2, 4)) + String(rng.int(1000000, 9999999)),
        className: level.name, registrationDate,
        status: left ? rng.pick(['منقطع', 'محوَّل']) : 'نشط', leaveDate,
        notes: late ? 'التحق بالمدرسة أثناء السنة' : ''
      });
      // Siblings and scholarships reduce the monthly fee, never the registration fee.
      if (rng.chance(0.04)) student = db.updateStudentDiscount(student.id, rng.chance(0.5)
        ? { discountType: 'percent', discountValue: rng.pick([25, 50]), discountReason: 'أخ أو أخت في المدرسة' }
        : { discountType: 'amount', discountValue: Math.min(level.fee, 200), discountReason: 'منحة المدرسة' });
      students.push({ ...student, profile: pickProfile(rng) });
    }
  }
  for (const student of students) seedStudentPayments(rng, cal, feeSettings, student);
  return students;
}

// How the family has been paying so far. Most are up to date; the rest leave the
// kinds of debt the fee screens must show (late months, part payments, nothing).
function pickProfile(rng) {
  const roll = rng.next();
  if (roll < 0.50) return 'regular';   // every past month paid in its own month
  if (roll < 0.58) return 'advance';   // also paid the current and next month
  if (roll < 0.75) return 'lump';      // catches up in one visit, last months still owed
  if (roll < 0.88) return 'partial';   // one month only half paid
  if (roll < 0.95) return 'debtor';    // registration only
  return 'none';                       // never paid anything
}

function seedStudentPayments(rng, cal, feeSettings, student) {
  const charges = dues.chargesFor(student, feeSettings).filter(c => c.amount > 0);
  const monthly = charges.filter(c => c.month !== dues.REGISTRATION && c.month !== 'يونيو' && dues.MONTHS.indexOf(c.month) <= cal.currentIndex);
  const registrationVisit = charges.filter(c => c.month === dues.REGISTRATION || (c.month === 'يونيو' && student.profile !== 'debtor'));
  const visit = (entries, date, notes) => entries.length && db.addStudentPayments({ studentId: student.id, date: clampDate(date, student.registrationDate, cal.today), entries, notes });
  if (student.profile === 'none') return;
  // Registration and June are due on the day of enrolment, in one visit.
  visit(registrationVisit.map(c => ({ month: c.month, amount: c.amount })), student.registrationDate, 'دفعة التسجيل');
  if (student.profile === 'debtor') return;
  if (student.profile === 'lump') {
    // One catch-up visit in December or January covering the months before it.
    const visitMonth = rng.pick(['ديسمبر', 'يناير']);
    const covered = monthly.filter(c => dues.MONTHS.indexOf(c.month) < dues.MONTHS.indexOf(visitMonth));
    visit(covered.map(c => ({ month: c.month, amount: c.amount })), cal.dayOf(visitMonth, rng.int(1, 28)), 'تسوية الأشهر المتأخرة');
    return;
  }
  const halfPaid = student.profile === 'partial' ? rng.pick(monthly.slice(0, -1).length ? monthly.slice(0, -1) : monthly) : null;
  for (const charge of monthly) {
    const current = dues.MONTHS.indexOf(charge.month) === cal.currentIndex;
    // The current month is only due since the 1st: half the regular families
    // have not paid it yet; a partial payer has not either.
    if (current && (student.profile === 'partial' || (student.profile === 'regular' && rng.chance(0.5)))) continue;
    const amount = charge === halfPaid ? dues.round2(charge.amount / 2) : charge.amount;
    visit([{ month: charge.month, amount }], cal.dayOf(charge.month, rng.int(1, current ? 27 : 12)), '');
  }
  if (student.profile === 'advance') {
    const next = dues.chargesFor(student, feeSettings).find(c => dues.MONTHS.indexOf(c.month) === cal.currentIndex + 1);
    if (next && next.amount > 0) visit([{ month: next.month, amount: next.amount }], cal.dayOf(dues.MONTHS[cal.currentIndex], rng.int(1, 27)), 'دفعة مقدمة للشهر القادم');
  }
}

function seedStaff(rng, cal, options) {
  const levels = LEVELS.slice(0, options.levels);
  const primary = levels.filter(l => PRIMARY_STAGES.includes(l.stage));
  const secondary = levels.filter(l => !PRIMARY_STAGES.includes(l.stage));
  const staff = [];
  const hire = (fields) => staff.push(db.addTeacher({ phone: String(rng.int(2, 4)) + String(rng.int(1000000, 9999999)), startDate: iso(cal.startYear, 9, rng.int(1, 30)), ...fields }));
  // One instructor (معلم) per kindergarten/primary class, on a fixed salary.
  for (const level of primary) hire({ name: `${rng.pick(BOYS)} ولد ${rng.pick(FAMILIES)}`, role: 'معلم', subject: 'جميع المواد', fixedSalary: INSTRUCTOR_SALARY, notes: `معلم قسم ${level.name}` });
  // Secondary teachers (أستاذ) are paid by the hour, about one per class plus
  // a few specialists shared between levels.
  const stages = [...new Set(secondary.map(l => l.stage))];
  for (let i = 0; i < Math.round(secondary.length * 1.2); i++) hire({ name: `${rng.pick(rng.chance(0.3) ? GIRLS : BOYS)} ${rng.chance(0.3) ? 'منت' : 'ولد'} ${rng.pick(FAMILIES)}`, role: 'أستاذ', stage: stages[i % stages.length], subject: SECONDARY_SUBJECTS[i % SECONDARY_SUBJECTS.length], hourlyRate: TEACHER_HOURLY_RATE });
  for (const [role, salary] of SUPPORT_STAFF) hire({ name: `${rng.pick(BOYS)} ولد ${rng.pick(FAMILIES)}`, role, fixedSalary: salary });
  // One teacher hired in January and one who stopped in January: both show up
  // as months without a salary on the staff screens.
  const newcomer = staff[staff.length - 4];
  db.updateTeacher(newcomer.id, { ...newcomer, startDate: cal.dayOf('يناير', 5) });
  const stopped = staff[primary.length];
  db.updateTeacher(stopped.id, { ...stopped, status: 'stopped', endDate: cal.dayOf('يناير', 31) });
  const hours = new Map(staff.map((t, i) => [t.id, t.role === 'أستاذ' ? 40 + (i * 7) % 41 : 0]));
  for (const teacher of db.getData().teachers) seedSalaries(rng, cal, teacher, hours.get(teacher.id));
  return staff;
}

// Salaries are earned on the last day of the month (fees.js rule): nothing but
// an advance can be recorded before that day.
function seedSalaries(rng, cal, teacher, baseHours) {
  for (let m = 0; m <= cal.currentIndex; m++) {
    const month = dues.MONTHS[m];
    const dueDate = dues.salaryDueDate(month, cal.startYear);
    if (dueDate < teacher.startDate || (teacher.status === 'stopped' && dueDate > teacher.endDate)) continue;
    const hours = teacher.role === 'أستاذ' ? baseHours + rng.int(-6, 6) : 0;
    const salaryDue = teacher.role === 'أستاذ' ? hours * teacher.hourlyRate : teacher.fixedSalary;
    const advance = rng.chance(0.25) ? Math.min(salaryDue, rng.pick([1000, 1500, 2000, 3000])) : 0;
    if (advance) db.addTeacherAdvance({ teacherId: teacher.id, month, amount: advance, salaryDue, date: cal.dayOf(month, rng.int(8, 20)), notes: 'سلفة على الراتب' });
    const current = m === cal.currentIndex;
    // The current month's salary is earned today: only some have been paid yet.
    if (current && rng.chance(0.6)) continue;
    const fraction = rng.chance(0.1) ? 0.5 : 1;
    const amount = dues.round2((salaryDue - advance) * fraction);
    if (amount <= 0) continue;
    const date = current ? cal.today : clampDate(dues.monthDate(dues.MONTHS[m + 1], cal.startYear, rng.int(1, 5)), dueDate, cal.today);
    db.addTeacherPayment({ teacherId: teacher.id, month, amount, hours, hourlyRate: teacher.hourlyRate, salaryDue, date: rng.chance(0.5) ? dueDate : date, notes: fraction < 1 ? 'دفعة جزئية من الراتب' : '' });
  }
}

function seedExpenses(rng, cal) {
  for (let m = 0; m <= cal.currentIndex; m++) {
    const month = dues.MONTHS[m];
    for (const [category, description, beneficiary, min, max] of EXPENSES) {
      if (category !== 'إيجار' && rng.chance(0.25)) continue;
      db.addExpense({ category, description, beneficiary, amount: rng.int(min, max), date: clampDate(cal.dayOf(month, rng.int(1, 28)), '', cal.today) });
    }
  }
}

function seedExams(rng, cal, students, options) {
  const templates = LEVELS.slice(0, options.levels).map(level => {
    const primary = PRIMARY_STAGES.includes(level.stage);
    const subjects = primary ? PRIMARY_SUBJECTS : SECONDARY_SUBJECTS.slice(0, level.stage === 'ثانوي' ? 9 : 8);
    return { department: level.name, level: primary ? 'ابتدائي' : level.stage, subjects: subjects.map((name, i) => ({ id: `${level.name}-${i + 1}`, name, coefficient: primary ? 0 : [3, 4, 2, 3, 2, 2, 2, 2, 2][i] })) };
  });
  db.saveExamSettings({ subjectTemplates: templates });
  const exams = [[1, cal.dayOf('ديسمبر', 15)], [2, cal.dayOf('فبراير', 20)]];
  for (const student of students) {
    if (student.status !== 'نشط' || student.profile === 'none') continue;
    const template = templates.find(t => t.department === student.className);
    const ability = rng.int(5, 18);
    for (const [examNo, date] of exams) {
      if (student.registrationDate > date) continue;
      db.saveExamRecord({ studentId: student.id, department: student.className, examNo, date, results: template.subjects.map(subject => {
        const score = Math.min(20, Math.max(0, ability + rng.int(-4, 4) + rng.pick([0, 0.5])));
        return { subjectId: subject.id, name: subject.name, coefficient: subject.coefficient, test: Math.max(0, score - rng.pick([0, 0.5, 1])), exam: score, score };
      }) });
    }
  }
}

async function seedTesting(baseDir = path.resolve(__dirname, '..'), options = {}) {
  const settings = { seed: 20270228, levels: LEVELS.length, minPerLevel: 20, maxPerLevel: 50, ...options };
  const rng = random(settings.seed);
  openTestDatabase(baseDir);
  try {
    // Everything but the settings and credentials is rebuilt; the previous
    // content is backed up first (database/testing/backups). One batch: the
    // thousands of receipts are written in a single transaction.
    const { backupPath, cal } = db.batch(() => {
      const backupPath = db.clearOperationalData();
      replaceLevels();
      const cal = calendar(db.publicSettings());
      db.setTestDate(cal.today);
      const students = seedStudents(rng, cal, settings);
      seedStaff(rng, cal, settings);
      seedExpenses(rng, cal);
      seedExams(rng, cal, students, settings);
      return { backupPath, cal };
    });
    const final = db.getData();
    const counts = Object.fromEntries(Object.entries(final).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length]));
    const perLevel = Object.fromEntries(LEVELS.slice(0, settings.levels).map(l => [l.name, final.students.filter(s => s.className === l.name).length]));
    return { database: path.join(baseDir, 'database', 'testing', 'school-data.sqlite'), backupPath, testDate: cal.today, schoolYear: final.settings.schoolYear, counts, perLevel };
  } finally { db.close(); }
}

if (require.main === module) {
  seedTesting(process.argv[2] ? path.resolve(process.argv[2]) : undefined)
    .then(result => { console.log(JSON.stringify(result, null, 2)); console.log('\nافتح التطبيق في وضع التجريب: سيعتمد تاريخ الاختبار تلقائيًا.'); })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { seedTesting, LEVELS };
