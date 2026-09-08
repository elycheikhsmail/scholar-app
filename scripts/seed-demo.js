// Synthetic local demonstration data. Existing records and credentials are preserved.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync, backup } = require('node:sqlite');
const db = require('../db');
const TAG = '[DEMO-V1]';

async function seedDemo(baseDir = path.resolve(__dirname, '..')) {
  db.init(baseDir);
  try {
    const initial = db.getData();
    const backupDir = path.join(baseDir, 'database', 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `before-demo-${Date.now()}.sqlite`);
    const source = new DatabaseSync(path.join(baseDir, 'database', 'school-data.sqlite'), { readOnly: true });
    try { await backup(source, backupPath); } finally { source.close(); }
    const departments = db.getDepartments().slice(0, 18);
    const boys = ['محمد', 'أحمد', 'سيدي', 'عبد الله', 'المختار', 'الحسن', 'إبراهيم', 'يوسف'];
    const girls = ['فاطمة', 'مريم', 'عائشة', 'خديجة', 'آمنة', 'زينب', 'سلمى', 'حفصة'];
    const families = ['الشيخ', 'محمد الأمين', 'المختار', 'أحمد سالم', 'عبد الرحمن', 'الحسن', 'سيدي محمد', 'إبراهيم'];
    const cities = ['نواكشوط', 'نواذيبو', 'روصو', 'أطار', 'كيهيدي', 'ألاك'];
    const students = [];
    const knownStudents = new Map(initial.students.map(s => [s.schoolNo, s]));
    const paymentKeys = new Set(initial.studentPayments.map(p => p.notes));
    for (let d = 0; d < departments.length; d++) {
      const department = departments[d];
      for (let n = 0; n < 8; n++) {
        const index = d * 8 + n;
        const schoolNo = `DEMO-${String(index + 1).padStart(4, '0')}`;
        let student = knownStudents.get(schoolNo);
        if (student && !student.notes?.startsWith(TAG)) throw new Error(`Numéro scolaire déjà utilisé : ${schoolNo}`);
        if (!student) {
          student = db.addStudent({
            schoolNo, name: `${(n % 2 ? girls : boys)[(d + n) % 8]} ${families[d % 8]} (تجريبي ${index + 1})`,
            gender: n % 2 ? 'أنثى' : 'ذكر', nni: String(1000 + index).padStart(10, '0'),
            birthPlace: cities[index % cities.length], birthDate: `${2021 - Math.min(d, 15)}-03-${String(n + 10).padStart(2, '0')}`,
            guardianName: `ولي أمر تجريبي ${index + 1}`, guardianPhone: '',
            className: department.name, registrationDate: '2026-09-01', registrationFee: 2000,
            monthlyFee: department.monthlyFee, notes: `${TAG} بيانات خيالية لاختبار التطبيق فقط`
          });
        }
        students.push(student);
        for (const [m, month] of ['رسوم التسجيل', 'أكتوبر', 'نوفمبر', 'ديسمبر'].entries()) {
          const due = m === 0 ? 2000 : Number(student.monthlyFee);
          const fraction = [1, 0.5, 0, 0.75][(n + m) % 4];
          const notes = `${TAG} student:${student.id} month:${m}`;
          if (due > 0 && fraction > 0 && !paymentKeys.has(notes)) {
            db.addStudentPayment({ studentId: student.id, month, amount: Math.round(due * fraction), date: `2026-${String(m + 9).padStart(2, '0')}-05`, notes });
          }
        }
      }
    }
    const roles = ['أستاذ', 'معلم', 'محاسب', 'مراقب', 'عامل يدوي', 'أخرى'];
    const salaryKeys = new Set(initial.teacherPayments.map(p => p.notes));
    const advanceKeys = new Set(initial.teacherAdvances.map(p => p.notes));
    for (let i = 0; i < 12; i++) {
      const notes = `${TAG} employee:${i}`;
      const role = roles[i % roles.length];
      const teacher = initial.teachers.find(t => t.notes === notes) || db.addTeacher({
        name: `${boys[i % 8]} ${families[(i + 3) % 8]} (موظف تجريبي ${i + 1})`, role,
        stage: i % 2 ? 'إعدادي' : 'ثانوي', subject: ['الرياضيات', 'العربية', 'الفرنسية'][i % 3],
        fixedSalary: role === 'أستاذ' ? 0 : 18000 + i * 1500, hourlyRate: role === 'أستاذ' ? 800 : 0,
        startDate: '2026-09-01', notes
      });
      const due = role === 'أستاذ' ? 24 * teacher.hourlyRate : teacher.fixedSalary;
      for (let m = 0; m < 3; m++) {
        const month = ['أكتوبر', 'نوفمبر', 'ديسمبر'][m];
        const date = `2026-${m + 10}-25`;
        const advanceNote = `${TAG} advance:${i}:${m}`;
        if (m === 0 && !advanceKeys.has(advanceNote)) db.addTeacherAdvance({ teacherId: teacher.id, month, amount: 2000, salaryDue: due, date: '2026-10-10', notes: advanceNote });
        const salaryNote = `${TAG} salary:${i}:${m}`;
        if (!salaryKeys.has(salaryNote)) db.addTeacherPayment({ teacherId: teacher.id, month, amount: Math.round((due - (m === 0 ? 2000 : 0)) * (m === 2 ? 0.5 : 1)), hours: role === 'أستاذ' ? 24 : 0, hourlyRate: teacher.hourlyRate, salaryDue: due, date, notes: salaryNote });
      }
    }
    const categories = ['إيجار', 'كهرباء', 'مياه', 'أدوات مدرسية', 'صيانة', 'نظافة'];
    for (let i = 0; i < 24; i++) {
      const notes = `${TAG} expense:${i}`;
      if (!initial.expenses.some(e => e.notes === notes)) db.addExpense({ category: categories[i % 6], description: `مصروف تجريبي — ${categories[i % 6]}`, amount: 500 + (i % 7) * 1250, beneficiary: 'مورد تجريبي', date: `2026-${10 + i % 3}-${String(1 + i).padStart(2, '0')}`, notes });
    }
    const templates = [...initial.examSettings.subjectTemplates];
    for (const department of departments) {
      if (!templates.some(t => t.department === department.name)) templates.push({
        department: department.name, level: ['Jardin', '6AF'].includes(department.name) ? 'ابتدائي' : 'ثانوي',
        subjects: ['العربية', 'الرياضيات', 'الفرنسية', 'التربية الإسلامية', 'العلوم', 'التاريخ والجغرافيا'].map((name, i) => ({ id: `demo-subject-${i}`, name, coefficient: [3, 4, 2, 2, 3, 1][i] }))
      });
    }
    db.saveExamSettings({ subjectTemplates: templates });
    const knownExams = new Set(initial.exams.map(e => `${e.studentId}:${e.examNo}:${e.department}`));
    for (const [i, student] of students.entries()) {
      for (let examNo = 1; examNo <= 2; examNo++) {
        if (knownExams.has(`${student.id}:${examNo}:${student.className}`)) continue;
        const template = templates.find(t => t.department === student.className);
        db.saveExamRecord({ studentId: student.id, department: student.className, examNo, date: examNo === 1 ? '2026-11-20' : '2026-12-20', results: template.subjects.map((subject, s) => {
          const score = Math.min(20, 4 + (i % 8) * 2 + ((s + examNo) % 3) * 0.5);
          return { subjectId: subject.id, name: subject.name, coefficient: subject.coefficient, score, test: score - 0.5, exam: score };
        }) });
      }
    }
    const final = db.getData();
    const counts = Object.fromEntries(Object.entries(final).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length]));
    return { backupPath, counts };
  } finally { db.close(); }
}
if (require.main === module) seedDemo(process.argv[2] ? path.resolve(process.argv[2]) : undefined).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { seedDemo };
