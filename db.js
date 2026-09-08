const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

let data;
let filePath;
let sqlite;
const COLLECTIONS = ['departments', 'students', 'studentPayments', 'teachers',
  'teacherPayments', 'teacherAdvances', 'expenses', 'exams'];

function close() {
  if (sqlite) sqlite.close();
  sqlite = null;
  data = undefined;
}

function createSchema(connection = sqlite) {
  connection.exec(`CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK(json_valid(value)));`);
  // One row per record; JSON preserves optional fields and nested exam results.
  for (const table of COLLECTIONS) {
    connection.exec(`CREATE TABLE IF NOT EXISTS "${table}" (
      id INTEGER PRIMARY KEY,
      position INTEGER NOT NULL,
      record TEXT NOT NULL CHECK(json_valid(record))
        CHECK(CAST(json_extract(record, '$.id') AS INTEGER) = id)
    );`);
  }
  for (const [table, field] of [['students', 'className'], ['studentPayments', 'studentId'],
    ['teacherPayments', 'teacherId'], ['teacherAdvances', 'teacherId'], ['exams', 'studentId']]) {
    connection.exec(`CREATE INDEX IF NOT EXISTS "${table}_${field}" ON "${table}" (json_extract(record, '$.${field}'));`);
  }
}

function readData() {
  const result = {};
  for (const row of sqlite.prepare('SELECT key, value FROM settings').all()) {
    Object.defineProperty(result, row.key, { value: JSON.parse(row.value), enumerable: true, writable: true, configurable: true });
  }
  for (const table of COLLECTIONS) {
    result[table] = sqlite.prepare(`SELECT record FROM "${table}" ORDER BY position`).all().map(row => JSON.parse(row.record));
  }
  return result;
}

function createBackup() {
  const backupDir = path.join(path.dirname(filePath), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `school-data-${stamp}-${crypto.randomUUID()}.sqlite`);
  // Copy the state loaded under the writer lock, so every cleared row is backed up.
  const snapshot = new DatabaseSync(backupPath);
  try {
    snapshot.exec('BEGIN IMMEDIATE');
    createSchema(snapshot);
    save(snapshot);
    snapshot.prepare("INSERT INTO metadata(key, value) VALUES ('schemaVersion', '1')").run();
    snapshot.exec('COMMIT');
  } finally {
    snapshot.close();
  }
  return backupPath;
}

const DEFAULT_DATA = {
  settings: {
    schoolName: 'مدرسة مكارم الأخلاق الحرة',
    schoolYear: '2026 / 2027',
    username: 'yaghoub',
    passwordHash: null,
    defaultMonthlyFee: 0,
    managerName: 'سيد محمد بوشارب',
    managerPhone: '22037331',
    schoolPhone: '',
    republic: 'الجمهورية الإسلامية الموريتانية',
    ministry: 'وزارة التعليم',
    regional: 'الإدارة الجهوية للتعليم'
  },
  departments: [
    { id: 1, name: 'Jardin', monthlyFee: 5000 },
    { id: 2, name: '6AF', monthlyFee: 12000 },
    { id: 3, name: '1AS', monthlyFee: 13000 },
    { id: 4, name: '2AS', monthlyFee: 14000 },
    { id: 5, name: '3AS', monthlyFee: 15000 },
    { id: 6, name: '4AS', monthlyFee: 16000 },
    { id: 7, name: '5O', monthlyFee: 17000 },
    { id: 8, name: '5C', monthlyFee: 17000 },
    { id: 9, name: '5A', monthlyFee: 17000 },
    { id: 10, name: '5D', monthlyFee: 17000 },
    { id: 11, name: '6A', monthlyFee: 18000 },
    { id: 12, name: '6C', monthlyFee: 18000 },
    { id: 13, name: '6D', monthlyFee: 18000 },
    { id: 14, name: '6O', monthlyFee: 18000 },
    { id: 15, name: '7C', monthlyFee: 19000 },
    { id: 16, name: '7A', monthlyFee: 19000 },
    { id: 17, name: '7D', monthlyFee: 19000 },
    { id: 18, name: '7O', monthlyFee: 19000 }
  ],
  students: [],
  studentPayments: [],
  teachers: [],
  teacherPayments: [],
  teacherAdvances: [],
  expenses: [],
  examSettings: {
    header: {
      republic: 'الجمهورية الإسلامية الموريتانية',
      ministry: 'وزارة التعليم',
      regional: 'الإدارة الجهوية للتعليم',
      schoolPhone: ''
    },
    subjectTemplates: [],
    remarksRules: [
      { min: 16, remark: 'تهنئة' },
      { min: 14, remark: 'تشجيع' },
      { min: 12, remark: 'جيد' },
      { min: 10, remark: 'مقبول' },
      { min: 8, remark: 'يحتاج إلى تحسين' },
      { min: 0, remark: 'ضعيف' }
    ],
    decisionRules: [
      { min: 10, decision: 'ناجح' },
      { min: 5, decision: 'معيد' },
      { min: 0, decision: 'مطرود' }
    ]
  },
  exams: []
};

const clean = value => value == null ? '' : String(value).trim();
const clone = value => JSON.parse(JSON.stringify(value));

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(String(password), salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, expected] = stored.split(':');
  const actual = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

function save(connection = sqlite) {
  // The caller holds BEGIN IMMEDIATE: only changed rows are written.
  for (const [key, value] of Object.entries(data)) {
    if (!COLLECTIONS.includes(key)) {
      connection.prepare(`INSERT INTO settings(key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE value != excluded.value`)
        .run(key, JSON.stringify(value));
    }
  }
  for (const table of COLLECTIONS) {
    const previous = new Map(connection.prepare(`SELECT id, position, record FROM "${table}"`).all().map(row => [row.id, row]));
    const seen = new Set();
    const upsert = connection.prepare(`INSERT INTO "${table}" (id, position, record) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET position = excluded.position, record = excluded.record`);
    data[table].forEach((item, position) => {
      const id = Number(item.id);
      if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) {
        throw new Error(`Identifiant invalide ou dupliqué dans ${table}: ${item.id}`);
      }
      seen.add(id);
      const record = JSON.stringify(item);
      const old = previous.get(id);
      if (!old || old.position !== position || old.record !== record) upsert.run(id, position, record);
      previous.delete(id);
    });
    const remove = connection.prepare(`DELETE FROM "${table}" WHERE id = ?`);
    for (const id of previous.keys()) remove.run(id);
  }
}

function init(baseDir) {
  close();
  const dbDir = path.join(baseDir, 'database');
  fs.mkdirSync(dbDir, { recursive: true });
  filePath = path.join(dbDir, 'school-data.sqlite');
  const legacyPath = path.join(dbDir, 'school-data.json');
  sqlite = new DatabaseSync(filePath);
  try {
    sqlite.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; BEGIN IMMEDIATE;');
    createSchema();
    const version = sqlite.prepare("SELECT value FROM metadata WHERE key = 'schemaVersion'").get();
    if (version) {
      if (version.value !== '1') throw new Error('Version de base de données SQLite non prise en charge.');
      data = readData();
    } else {
      data = fs.existsSync(legacyPath) ? JSON.parse(fs.readFileSync(legacyPath, 'utf8')) : clone(DEFAULT_DATA);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Fichier JSON de migration invalide.');
      for (const key of COLLECTIONS) {
        if (key in data && !Array.isArray(data[key])) throw new Error(`Collection JSON invalide: ${key}`);
      }
      normalizeData();
      save();
      sqlite.prepare("INSERT INTO metadata(key, value) VALUES ('schemaVersion', '1')").run();
    }
    sqlite.exec('COMMIT');
  } catch (error) {
    try { sqlite.exec('ROLLBACK'); } catch {}
    close();
    throw new Error(`Impossible d'ouvrir ou de migrer la base de données: ${error.message}`, { cause: error });
  }
}

function normalizeData() {
  data.settings = { ...DEFAULT_DATA.settings, ...(data.settings || {}) };
  for (const key of ['departments','students','studentPayments','teachers','teacherPayments','teacherAdvances','expenses','exams']) {
    if (!Array.isArray(data[key])) data[key] = [];
  }
  data.examSettings = {
    ...clone(DEFAULT_DATA.examSettings),
    ...(data.examSettings || {}),
    header: { ...clone(DEFAULT_DATA.examSettings.header), ...((data.examSettings || {}).header || {}) },
    subjectTemplates: Array.isArray(data.examSettings?.subjectTemplates) ? data.examSettings.subjectTemplates : [],
    remarksRules: Array.isArray(data.examSettings?.remarksRules) ? data.examSettings.remarksRules : clone(DEFAULT_DATA.examSettings.remarksRules),
    decisionRules: Array.isArray(data.examSettings?.decisionRules) ? data.examSettings.decisionRules : clone(DEFAULT_DATA.examSettings.decisionRules)
  };
  data.studentPayments.forEach(p => { if (!p.invoiceNo) p.invoiceNo = `F-${String(Number(p.id)||0).padStart(6,'0')}`; if (!p.paymentType) p.paymentType = p.month === 'رسوم التسجيل' ? 'registration' : 'monthly'; });
  const feeMap = new Map(DEFAULT_DATA.departments.map(d => [d.name, d.monthlyFee]));
  data.departments = data.departments.map((d, i) => ({ ...d, id: Number(d.id) || i + 1, name: clean(d.name), monthlyFee: d.monthlyFee != null && Number.isFinite(Number(d.monthlyFee)) ? Math.max(0, Number(d.monthlyFee)) : Number(feeMap.get(clean(d.name)) || 0) }));
  const existingNames = new Set(data.departments.map(d => clean(d.name)));
  for (const d of DEFAULT_DATA.departments) { if (!existingNames.has(d.name)) data.departments.push({ ...clone(d), id: nextId('departments') }); }
  if (!data.settings.passwordHash) data.settings.passwordHash = hashPassword('36485606');
}

function nextId(collection) {
  return data[collection].reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
}

function publicSettings() {
  return {
    schoolName: data.settings.schoolName,
    schoolYear: data.settings.schoolYear,
    username: data.settings.username,
    defaultMonthlyFee: Number(data.settings.defaultMonthlyFee) || 0,
    managerName: data.settings.managerName || '',
    managerPhone: data.settings.managerPhone || '',
    schoolPhone: data.settings.schoolPhone || '',
    republic: data.settings.republic || 'الجمهورية الإسلامية الموريتانية',
    ministry: data.settings.ministry || 'وزارة التعليم',
    regional: data.settings.regional || 'الإدارة الجهوية للتعليم'
  };
}

function getData() { return clone(data); }
function checkLogin(username, password) {
  return clean(username) === clean(data.settings.username) && verifyPassword(password, data.settings.passwordHash);
}

function updateSettings(input) {
  if (!clean(input.schoolName)) throw new Error('اسم المدرسة مطلوب.');
  if (!clean(input.schoolYear)) throw new Error('السنة الدراسية مطلوبة.');
  if (!clean(input.username)) throw new Error('اسم المستخدم مطلوب.');
  data.settings.schoolName = clean(input.schoolName);
  data.settings.schoolYear = clean(input.schoolYear);
  data.settings.username = clean(input.username);
  data.settings.defaultMonthlyFee = Math.max(0, Number(input.defaultMonthlyFee) || 0);
  data.settings.managerName = clean(input.managerName);
  data.settings.managerPhone = clean(input.managerPhone);
  data.settings.schoolPhone = clean(input.schoolPhone);
  data.settings.republic = clean(input.republic) || DEFAULT_DATA.settings.republic;
  data.settings.ministry = clean(input.ministry) || DEFAULT_DATA.settings.ministry;
  data.settings.regional = clean(input.regional) || DEFAULT_DATA.settings.regional;
  if (data.settings.managerPhone && !/^\d{8}$/.test(data.settings.managerPhone)) throw new Error('هاتف المدير يجب أن يتكون من 8 أرقام.');
  if (input.newPassword) data.settings.passwordHash = hashPassword(input.newPassword);
  save();
  return publicSettings();
}

function getDepartments() { return clone(data.departments); }
function clearOperationalData(backupPath) {
  data.students = [];
  data.studentPayments = [];
  data.teachers = [];
  data.teacherPayments = [];
  data.teacherAdvances = [];
  data.expenses = [];
  data.exams = [];
  save();
  return backupPath;
}


function addDepartment(payload) {
  const value = clean(payload?.name ?? payload);
  const fee = Math.max(0, Number(payload?.monthlyFee ?? 0) || 0);
  if (!value) throw new Error('اسم القسم مطلوب.');
  if (data.departments.some(x => clean(x.name) === value)) throw new Error('هذا القسم موجود مسبقًا.');
  const item = { id: nextId('departments'), name: value, monthlyFee: fee };
  data.departments.push(item); save(); return item;
}
function updateDepartment(id, payload) {
  const item = data.departments.find(x => Number(x.id) === Number(id));
  if (!item) throw new Error('القسم غير موجود.');
  const value = clean(payload?.name);
  const fee = Math.max(0, Number(payload?.monthlyFee ?? item.monthlyFee) || 0);
  if (!value) throw new Error('اسم القسم مطلوب.');
  if (data.departments.some(x => Number(x.id) !== Number(id) && clean(x.name) === value)) throw new Error('هذا القسم موجود مسبقًا.');
  const old = item.name;
  item.name = value; item.monthlyFee = fee;
  data.students.forEach(s => { if (clean(s.className) === old) s.className = value; });
  save(); return item;
}
function deleteDepartment(id) {
  const item = data.departments.find(x => Number(x.id) === Number(id));
  if (!item) throw new Error('القسم غير موجود.');
  if (data.students.some(s => clean(s.className) === clean(item.name))) throw new Error('لا يمكن حذف قسم مرتبط بطلاب.');
  data.departments = data.departments.filter(x => Number(x.id) !== Number(id));
  save();
}

function nextCallNo(department, excludeId = null) {
  const used = new Set(
    data.students
      .filter(s => clean(s.className) === clean(department) && Number(s.id) !== Number(excludeId))
      .map(s => Number.parseInt(clean(s.callNo), 10))
      .filter(Number.isFinite)
  );
  let n = 1;
  while (used.has(n)) n++;
  return String(n);
}

function validateStudent(s, id = null) {
  const schoolNo = clean(s.schoolNo);
  const nni = clean(s.nni);
  if (!schoolNo) throw new Error('الرقم المدرسي مطلوب.');
  if (!clean(s.name)) throw new Error('اسم الطالب مطلوب.');
  if (!['ذكر','أنثى'].includes(clean(s.gender))) throw new Error('اختر جنس الطالب.');
  if (!/^\d{10}$/.test(nni)) throw new Error('الرقم الوطني NNI يجب أن يتكون من 10 أرقام بالضبط.');
  if (data.students.some(x => Number(x.id) !== Number(id) && clean(x.nni) === nni)) throw new Error('الرقم الوطني NNI مسجل مسبقًا.');
  if (data.students.some(x => Number(x.id) !== Number(id) && clean(x.schoolNo) === schoolNo)) throw new Error('الرقم المدرسي مستخدم لطالب آخر.');
  const dep = clean(s.className);
  if (!dep) throw new Error('اختر القسم.');
  if (!data.departments.some(x => clean(x.name) === dep)) throw new Error('القسم غير موجود في قائمة الأقسام.');
  if (s.guardianPhone && !/^\d{8}$/.test(clean(s.guardianPhone))) throw new Error('رقم هاتف ولي الأمر يجب أن يتكون من 8 أرقام.');
}

function addStudent(s) {
  validateStudent(s);
  const student = {
    id: nextId('students'),
    schoolNo: clean(s.schoolNo),
    name: clean(s.name),
    callNo: nextCallNo(s.className),
    nni: clean(s.nni),
    birthPlace: clean(s.birthPlace),
    birthDate: clean(s.birthDate),
    guardianName: clean(s.guardianName),
    guardianPhone: clean(s.guardianPhone),
    className: clean(s.className),
    registrationDate: clean(s.registrationDate) || new Date().toISOString().slice(0,10),
    registrationFee: Math.max(0, Number(s.registrationFee) || 0),
    monthlyFee: Math.max(0, Number(s.monthlyFee) || Number(data.settings.defaultMonthlyFee) || 0),
    notes: clean(s.notes),
    gender: clean(s.gender)
  };
  data.students.push(student);
  const initialPaid = Math.max(0, Number(s.initialPaid) || 0);
  if (initialPaid > 0) {
    const paymentId = nextId('studentPayments');
    data.studentPayments.push({
      id: paymentId,
      invoiceNo: `F-${String(paymentId).padStart(6,'0')}`,
      studentId: student.id,
      month: 'رسوم التسجيل',
      paymentType: 'registration',
      amount: initialPaid,
      date: clean(s.initialPaymentDate) || new Date().toISOString().slice(0,10),
      notes: 'دفعة رسوم التسجيل عند تسجيل الطالب'
    });
  }
  save(); return student;
}

function currentPaymentMonth() {
  const m = new Date().getMonth() + 1;
  return m >= 10 ? ['أكتوبر','نوفمبر','ديسمبر','يناير','فبراير','مارس','أبريل','مايو','يونيو'][m-10] : (m <= 6 ? ['أكتوبر','نوفمبر','ديسمبر','يناير','فبراير','مارس','أبريل','مايو','يونيو'][m+2] : 'أكتوبر');
}

function updateStudent(id, s) {
  const student = data.students.find(x => Number(x.id) === Number(id));
  if (!student) throw new Error('الطالب غير موجود.');
  validateStudent(s, id);
  const oldDep = clean(student.className), newDep = clean(s.className);
  Object.assign(student, {
    schoolNo: clean(s.schoolNo), name: clean(s.name),
    callNo: oldDep === newDep ? student.callNo : nextCallNo(newDep, id),
    nni: clean(s.nni), gender: clean(s.gender), birthPlace: clean(s.birthPlace), birthDate: clean(s.birthDate),
    guardianName: clean(s.guardianName), guardianPhone: clean(s.guardianPhone), className: newDep,
    registrationDate: clean(s.registrationDate), registrationFee: Math.max(0, Number(s.registrationFee) || 0),
    monthlyFee: Math.max(0, Number(s.monthlyFee) || 0), notes: clean(s.notes)
  });
  save(); return student;
}

function deleteStudent(id) {
  const n = Number(id);
  data.students = data.students.filter(x => Number(x.id) !== n);
  data.studentPayments = data.studentPayments.filter(x => Number(x.studentId) !== n);
  save();
}

function addStudentPayment(p) {
  const student = data.students.find(x => Number(x.id) === Number(p.studentId));
  if (!student) throw new Error('الطالب غير موجود.');
  const amount = Number(p.amount) || 0;
  const month = clean(p.month);
  if (!month || amount <= 0) throw new Error('أدخل الشهر والمبلغ بشكل صحيح.');
  const existing = data.studentPayments.filter(x => Number(x.studentId) === Number(student.id) && clean(x.month) === month).reduce((a,x)=>a+Number(x.amount||0),0);
  const payment = { id: nextId('studentPayments'), invoiceNo:`F-${String(nextId('studentPayments')).padStart(6,'0')}`, studentId:Number(student.id), month, paymentType: month === 'رسوم التسجيل' ? 'registration' : 'monthly', amount, date:clean(p.date)||new Date().toISOString().slice(0,10), notes:clean(p.notes) };
  data.studentPayments.push(payment); save(); return payment;
}
function updateStudentPayment(id,p) {
  const payment = data.studentPayments.find(x=>Number(x.id)===Number(id)); if(!payment)throw new Error('الدفعة غير موجودة.');
  const student=data.students.find(x=>Number(x.id)===Number(payment.studentId)); if(!student)throw new Error('الطالب غير موجود.');
  const amount=Number(p.amount)||0, month=clean(p.month); if(!month||amount<=0)throw new Error('بيانات الدفعة غير صحيحة.');
  const others=data.studentPayments.filter(x=>Number(x.studentId)===student.id&&clean(x.month)===month&&Number(x.id)!==payment.id).reduce((a,x)=>a+Number(x.amount||0),0);
  Object.assign(payment,{month,paymentType: month === 'رسوم التسجيل' ? 'registration' : 'monthly',amount,date:clean(p.date)||payment.date,notes:clean(p.notes)}); if(!payment.invoiceNo) payment.invoiceNo=`F-${String(payment.id).padStart(6,'0')}`; save(); return payment;
}
function deleteStudentPayment(id){data.studentPayments=data.studentPayments.filter(x=>Number(x.id)!==Number(id));save();}

function addTeacher(t) {
  const role=clean(t.role)||'أخرى';
  const teacher={
    id:nextId('teachers'),name:clean(t.name),phone:clean(t.phone),role,
    stage:clean(t.stage),subject:clean(t.subject),fixedSalary:Math.max(0,Number(t.fixedSalary)||0),hourlyRate:Math.max(0,Number(t.hourlyRate)||0),
    startDate:clean(t.startDate)||new Date().toISOString().slice(0,10),notes:clean(t.notes)
  };
  if(!teacher.name)throw new Error('اسم الموظف مطلوب.');
  if(teacher.phone && !/^\d{8}$/.test(teacher.phone))throw new Error('الهاتف يجب أن يتكون من 8 أرقام.');
  data.teachers.push(teacher);save();return teacher;
}
function updateTeacher(id,t){
  const teacher=data.teachers.find(x=>Number(x.id)===Number(id));if(!teacher)throw new Error('الموظف غير موجود.');
  Object.assign(teacher,{name:clean(t.name),phone:clean(t.phone),role:clean(t.role)||'أخرى',stage:clean(t.stage),subject:clean(t.subject),fixedSalary:Math.max(0,Number(t.fixedSalary)||0),hourlyRate:Math.max(0,Number(t.hourlyRate)||0),startDate:clean(t.startDate),notes:clean(t.notes)});
  save();return teacher;
}
function deleteTeacher(id){const n=Number(id);data.teachers=data.teachers.filter(x=>Number(x.id)!==n);data.teacherPayments=data.teacherPayments.filter(x=>Number(x.teacherId)!==n);data.teacherAdvances=data.teacherAdvances.filter(x=>Number(x.teacherId)!==n);save();}
function addTeacherPayment(p){
  const teacher=data.teachers.find(x=>Number(x.id)===Number(p.teacherId));if(!teacher)throw new Error('الموظف غير موجود.');
  const amount=Number(p.amount)||0;if(!clean(p.month)||amount<=0)throw new Error('بيانات الراتب غير صحيحة.');
  const payment={id:nextId('teacherPayments'),teacherId:teacher.id,month:clean(p.month),amount,date:clean(p.date)||new Date().toISOString().slice(0,10),notes:clean(p.notes),hours:Math.max(0,Number(p.hours)||0),hourlyRate:Math.max(0,Number(p.hourlyRate)||0),salaryDue:Math.max(0,Number(p.salaryDue)||0)};
  data.teacherPayments.push(payment);save();return payment;
}
function updateTeacherPayment(id,p){
  const payment=data.teacherPayments.find(x=>Number(x.id)===Number(id));
  if(!payment)throw new Error('دفعة الراتب غير موجودة.');
  const teacher=data.teachers.find(x=>Number(x.id)===Number(payment.teacherId));
  if(!teacher)throw new Error('الموظف غير موجود.');
  const amount=Number(p.amount)||0, month=clean(p.month);
  if(!month||amount<=0)throw new Error('بيانات الراتب غير صحيحة.');
  const hours=teacher.role==='أستاذ'?Math.max(0,Number(p.hours)||0):0;
  const hourlyRate=teacher.role==='أستاذ'?Math.max(0,Number(p.hourlyRate)||teacher.hourlyRate||0):0;
  const salaryDue=teacher.role==='أستاذ'?Math.max(0,Number(p.salaryDue)||hours*hourlyRate):Math.max(0,Number(p.salaryDue)||teacher.fixedSalary||0);
  const otherPayments=data.teacherPayments.filter(x=>Number(x.teacherId)===teacher.id&&clean(x.month)===month&&Number(x.id)!==payment.id).reduce((a,x)=>a+Number(x.amount||0),0);
  const advances=data.teacherAdvances.filter(x=>Number(x.teacherId)===teacher.id&&clean(x.month)===month).reduce((a,x)=>a+Number(x.amount||0),0);
  if(salaryDue>0&&amount+otherPayments+advances>salaryDue)throw new Error('الدفعة الجديدة تتجاوز المتاح بعد احتساب السلف والدفعات الأخرى.');
  Object.assign(payment,{month,amount,date:clean(p.date)||payment.date,notes:clean(p.notes),hours,hourlyRate,salaryDue});
  save();return payment;
}
function deleteTeacherPayment(id){data.teacherPayments=data.teacherPayments.filter(x=>Number(x.id)!==Number(id));save();}
function addTeacherAdvance(p){
  const teacher=data.teachers.find(x=>Number(x.id)===Number(p.teacherId));if(!teacher)throw new Error('الموظف غير موجود.');
  const amount=Number(p.amount)||0;if(!clean(p.month)||amount<=0)throw new Error('بيانات السلفة غير صحيحة.');
  const due=Math.max(0,Number(p.salaryDue)||0);const current=data.teacherAdvances.filter(x=>Number(x.teacherId)===teacher.id&&clean(x.month)===clean(p.month)).reduce((a,x)=>a+Number(x.amount||0),0);
  const payments=data.teacherPayments.filter(x=>Number(x.teacherId)===teacher.id&&clean(x.month)===clean(p.month)).reduce((a,x)=>a+Number(x.amount||0),0);
  if(due>0&&amount>Math.max(0,due-current-payments))throw new Error('السلفة أكبر من المتاح لهذا الشهر.');
  const advance={id:nextId('teacherAdvances'),teacherId:teacher.id,month:clean(p.month),amount,date:clean(p.date)||new Date().toISOString().slice(0,10),notes:clean(p.notes),salaryDue:due};
  data.teacherAdvances.push(advance);save();return advance;
}
function updateTeacherAdvance(id,p){
  const advance=data.teacherAdvances.find(x=>Number(x.id)===Number(id));
  if(!advance)throw new Error('السلفة غير موجودة.');
  const teacher=data.teachers.find(x=>Number(x.id)===Number(advance.teacherId));
  if(!teacher)throw new Error('الموظف غير موجود.');
  const amount=Number(p.amount)||0,month=clean(p.month);
  if(!month||amount<=0)throw new Error('بيانات السلفة غير صحيحة.');
  const due=Math.max(0,Number(p.salaryDue)||advance.salaryDue||0);
  const currentOthers=data.teacherAdvances.filter(x=>Number(x.teacherId)===teacher.id&&clean(x.month)===month&&Number(x.id)!==advance.id).reduce((a,x)=>a+Number(x.amount||0),0);
  const payments=data.teacherPayments.filter(x=>Number(x.teacherId)===teacher.id&&clean(x.month)===month).reduce((a,x)=>a+Number(x.amount||0),0);
  if(due>0&&amount>Math.max(0,due-currentOthers-payments))throw new Error('السلفة أكبر من المتاح لهذا الشهر.');
  Object.assign(advance,{month,amount,date:clean(p.date)||advance.date,notes:clean(p.notes),salaryDue:due});
  save();return advance;
}
function deleteTeacherAdvance(id){data.teacherAdvances=data.teacherAdvances.filter(x=>Number(x.id)!==Number(id));save();}

function addExpense(e){const o={id:nextId('expenses'),category:clean(e.category),description:clean(e.description),amount:Math.max(0,Number(e.amount)||0),date:clean(e.date)||new Date().toISOString().slice(0,10),beneficiary:clean(e.beneficiary),notes:clean(e.notes)};if(!o.category||o.amount<=0)throw Error('نوع المصروف والمبلغ مطلوبان.');data.expenses.push(o);save();return o;}
function updateExpense(id,e){const o=data.expenses.find(x=>Number(x.id)===Number(id));if(!o)throw Error('المصروف غير موجود.');Object.assign(o,{category:clean(e.category),description:clean(e.description),amount:Math.max(0,Number(e.amount)||0),date:clean(e.date)||o.date,beneficiary:clean(e.beneficiary),notes:clean(e.notes)});save();return o;}
function deleteExpense(id){data.expenses=data.expenses.filter(x=>Number(x.id)!==Number(id));save();}


function getExamData() {
  return { settings: clone(data.examSettings), exams: clone(data.exams) };
}
function saveExamSettings(input) {
  data.examSettings = {
    ...data.examSettings,
    header: { ...data.examSettings.header, ...(input.header || {}) },
    subjectTemplates: Array.isArray(input.subjectTemplates) ? input.subjectTemplates : data.examSettings.subjectTemplates,
    remarksRules: Array.isArray(input.remarksRules) ? input.remarksRules : data.examSettings.remarksRules,
    decisionRules: Array.isArray(input.decisionRules) ? input.decisionRules : data.examSettings.decisionRules
  };
  save(); return getExamData().settings;
}
function nextExamId(){ return nextId('exams'); }
function saveExamRecord(input) {
  const department=clean(input.department), studentId=Number(input.studentId);
  if(!department || !studentId) throw new Error('اختر القسم والطالب.');
  const student=data.students.find(s=>Number(s.id)===studentId);
  if(!student) throw new Error('الطالب غير موجود.');
  const examNo=Number(input.examNo);
  if(![1,2,3].includes(examNo)) throw new Error('رقم الامتحان غير صحيح.');
  const template=data.examSettings.subjectTemplates.find(x=>clean(x.department)===department);
  const subjects=Array.isArray(template?.subjects)?template.subjects:[];
  const primary=template?.level==='ابتدائي' || ['Jardin','6AF'].includes(department);
  const results=(input.results||[]).map(r=>{
    const sub=subjects.find(s=>String(s.id)===String(r.subjectId)) || subjects.find(s=>clean(s.name)===clean(r.name));
    const coefficient=Number(r.coefficient ?? sub?.coefficient ?? 1)||1;
    const test=Number(r.test)||0, exam=Number(r.exam)||0, score=Number(r.score)||0;
    return {subjectId: sub?.id || r.subjectId || String(Date.now()), name: clean(r.name||sub?.name), test, exam, score, coefficient, total: primary ? score : exam*coefficient};
  }).filter(r=>r.name);
  const idx=data.exams.findIndex(x=>Number(x.examNo)===examNo && Number(x.studentId)===studentId && clean(x.department)===department);
  const rec={id:idx>=0?data.exams[idx].id:nextExamId(),examNo,department,studentId,studentName:student.name,className:student.className,results,date:clean(input.date)||new Date().toISOString().slice(0,10)};
  if(idx>=0)data.exams[idx]=rec;else data.exams.push(rec);
  save(); return clone(rec);
}
function deleteExamRecord(id){data.exams=data.exams.filter(x=>Number(x.id)!==Number(id));save();}

module.exports={init,getData,getDepartments,addDepartment,updateDepartment,deleteDepartment,clearOperationalData,publicSettings,checkLogin,updateSettings,addStudent,updateStudent,deleteStudent,addStudentPayment,updateStudentPayment,deleteStudentPayment,addTeacher,updateTeacher,deleteTeacher,addTeacherPayment,updateTeacherPayment,deleteTeacherPayment,addTeacherAdvance,updateTeacherAdvance,deleteTeacherAdvance,addExpense,updateExpense,deleteExpense, getExamData, saveExamSettings, saveExamRecord, deleteExamRecord,
};

// Reload within a transaction so separate server processes cannot overwrite stale state.
const readOperations = new Set(['getData', 'getDepartments', 'publicSettings', 'checkLogin', 'getExamData']);
for (const [name, operation] of Object.entries(module.exports)) {
  if (name === 'init') continue;
  module.exports[name] = (...args) => {
    if (!sqlite) throw new Error('La base de données doit être initialisée.');
    sqlite.exec(readOperations.has(name) ? 'BEGIN' : 'BEGIN IMMEDIATE');
    try {
      data = readData();
      const backupPath = name === 'clearOperationalData' ? createBackup() : null;
      const result = operation(...(backupPath ? [backupPath] : args));
      sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      data = undefined;
      throw error;
    }
  };
}
module.exports.close = close;
