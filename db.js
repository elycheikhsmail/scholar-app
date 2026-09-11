const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const dues = require('./public/fees.js');

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

// Fees used to be copied onto every student. They now live in the settings and
// in the level, so an older record's copy is dropped as it is read: leaving it
// there would put a second, silent answer next to the one the school sets.
function dropLegacyStudentFees(student) {
  delete student.feeHistory; delete student.monthlyFee; delete student.registrationFee;
  return student;
}

let touched;
function readData() {
  const result = {};
  touched = new Set();
  for (const row of sqlite.prepare('SELECT key, value FROM settings').all()) {
    Object.defineProperty(result, row.key, { value: JSON.parse(row.value), enumerable: true, writable: true, configurable: true });
  }
  // Parsing every record of every collection cost more than most operations
  // needed, so a collection materialises on first access and only the
  // collections an operation actually reached are written back.
  for (const table of COLLECTIONS) {
    let rows;
    Object.defineProperty(result, table, {
      enumerable: true, configurable: true,
      get() {
        if (!rows) { rows = sqlite.prepare(`SELECT record FROM "${table}" ORDER BY position`).all().map(row => JSON.parse(row.record)); touched.add(table); }
        if (table === 'students') rows.forEach(dropLegacyStudentFees);
        return rows;
      },
      set(value) { rows = value; touched.add(table); }
    });
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
    save(snapshot, new Set(COLLECTIONS));
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
    registrationFee: 200,
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

function save(connection = sqlite, only = touched) {
  // The caller holds BEGIN IMMEDIATE: only changed rows are written.
  // Object.keys avoids the collection getters, which would defeat lazy loading.
  for (const key of Object.keys(data)) {
    if (!COLLECTIONS.includes(key)) {
      connection.prepare(`INSERT INTO settings(key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE value != excluded.value`)
        .run(key, JSON.stringify(data[key]));
    }
  }
  for (const table of COLLECTIONS) {
    if (only && !only.has(table)) continue;
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

function init(baseDir, options = {}) {
  const mode = options.mode || 'production';
  if (!['production','test'].includes(mode)) throw new Error('وضع التطبيق غير صحيح.');
  close();
  const dbDir = mode === 'test' ? path.join(baseDir, 'database', 'testing') : path.join(baseDir, 'database');
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
      if (!fs.existsSync(legacyPath) && options.initialSettings) data.settings = clone(options.initialSettings);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Fichier JSON de migration invalide.');
      for (const key of COLLECTIONS) {
        if (key in data && !Array.isArray(data[key])) throw new Error(`Collection JSON invalide: ${key}`);
      }
      normalizeData();
      save(sqlite, new Set(COLLECTIONS));
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
  data.students.forEach(s => {
    if (!dues.STUDENT_STATUSES.includes(clean(s.status))) s.status = dues.ACTIVE_STATUS;
    if (typeof s.leaveDate !== 'string') s.leaveDate = '';
    if (s.status === dues.ACTIVE_STATUS) s.leaveDate = '';
    if (!dues.DISCOUNT_TYPES.includes(clean(s.discountType))) s.discountType = '';
    s.discountValue = s.discountType ? Math.max(0, Number(s.discountValue) || 0) : 0;
    if (typeof s.discountReason !== 'string') s.discountReason = '';
    dropLegacyStudentFees(s);
  });
  // Invoice numbers come from a sequence that never decreases: `nextId` reuses
  // the id of a deleted receipt, which would print the same number twice.
  data.invoiceSequence = Math.max(Number(data.invoiceSequence) || 0, highestInvoiceSequence());
  const usedInvoiceNos = new Set();
  data.studentPayments.forEach(p => {
    if (!p.invoiceNo || usedInvoiceNos.has(p.invoiceNo)) p.invoiceNo = nextInvoiceNo();
    usedInvoiceNos.add(p.invoiceNo);
    if (!p.paymentType) p.paymentType = p.month === 'رسوم التسجيل' ? 'registration' : 'monthly';
  });
  const feeMap = new Map(DEFAULT_DATA.departments.map(d => [d.name, d.monthlyFee]));
  data.departments = data.departments.map((d, i) => ({ ...d, id: Number(d.id) || i + 1, name: clean(d.name), monthlyFee: d.monthlyFee != null && Number.isFinite(Number(d.monthlyFee)) ? Math.max(0, Number(d.monthlyFee)) : Number(feeMap.get(clean(d.name)) || 0) }));
  const existingNames = new Set(data.departments.map(d => clean(d.name)));
  for (const d of DEFAULT_DATA.departments) { if (!existingNames.has(d.name)) data.departments.push({ ...clone(d), id: nextId('departments') }); }
  if (!data.settings.passwordHash) data.settings.passwordHash = hashPassword('36485606');
}

function nextId(collection) {
  return data[collection].reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
}

function invoiceSequenceOf(invoiceNo) {
  const match = /^F-(\d+)$/.exec(String(invoiceNo || ''));
  return match ? Number(match[1]) : 0;
}
function highestInvoiceSequence() {
  return data.studentPayments.reduce((m, p) => Math.max(m, invoiceSequenceOf(p.invoiceNo), Number(p.id) || 0), 0);
}
function nextInvoiceNo() {
  // Databases created before the sequence existed resume after the highest number issued.
  if (data.invoiceSequence == null) data.invoiceSequence = highestInvoiceSequence();
  data.invoiceSequence = (Number(data.invoiceSequence) || 0) + 1;
  return `F-${String(data.invoiceSequence).padStart(6, '0')}`;
}

function publicSettings() {
  return {
    schoolName: data.settings.schoolName,
    schoolYear: data.settings.schoolYear,
    username: data.settings.username,
    registrationFee: Math.max(0, Number(data.settings.registrationFee) || 0),
    defaultMonthlyFee: Math.max(0, Number(data.settings.defaultMonthlyFee) || 0),
    managerName: data.settings.managerName || '',
    managerPhone: data.settings.managerPhone || '',
    schoolPhone: data.settings.schoolPhone || '',
    republic: data.settings.republic || 'الجمهورية الإسلامية الموريتانية',
    ministry: data.settings.ministry || 'وزارة التعليم',
    regional: data.settings.regional || 'الإدارة الجهوية للتعليم'
  };
}

function getData() { return clone(data); }
function getCoreData() {
  // Settings go through publicSettings(): copying data.settings wholesale sent
  // the scrypt passwordHash to the browser on every load().
  const result = { settings: publicSettings() };
  for (const key of Object.keys(data)) {
    if (key === 'exams' || key === 'examSettings' || key === 'settings') continue;
    result[key] = clone(data[key]);
  }
  return result;
}
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

// The dues engine resolves every charge from the school's own fees, so it needs
// the levels alongside the settings row.
function feeSettings() { return { ...data.settings, departments: data.departments }; }

// «إعدادات الرسوم» : one registration fee for the school, and the fee of a level
// for any student whose department carries none.
function updateFeeSettings(input) {
  for (const field of ['registrationFee', 'defaultMonthlyFee']) {
    const value = Number(input && input[field]);
    if (input[field] === '' || input[field] == null || !Number.isFinite(value) || value < 0) throw new Error('أدخل رسومًا صحيحة لا تقل عن صفر.');
  }
  data.settings.registrationFee = Math.max(0, Number(input.registrationFee));
  data.settings.defaultMonthlyFee = Math.max(0, Number(input.defaultMonthlyFee));
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
  const status = clean(s.status) || dues.ACTIVE_STATUS;
  if (!dues.STUDENT_STATUSES.includes(status)) throw new Error('حالة الطالب غير صحيحة.');
  const leaveDate = clean(s.leaveDate);
  if (leaveDate && !/^\d{4}-\d{2}-\d{2}$/.test(leaveDate)) throw new Error('تاريخ المغادرة يجب أن يكون بصيغة YYYY-MM-DD.');
  // A departure must carry a date, because the date is what stops the monthly charges.
  if (leaveDate && status === dues.ACTIVE_STATUS) throw new Error('اختر حالة المغادرة عند تحديد تاريخ المغادرة.');
  if (!leaveDate && status !== dues.ACTIVE_STATUS) throw new Error('حدد تاريخ المغادرة عند تغيير حالة الطالب.');
  const registrationDate = clean(s.registrationDate);
  if (leaveDate && registrationDate && leaveDate < registrationDate) throw new Error('تاريخ المغادرة يجب أن يكون بعد تاريخ التسجيل.');
}

function validateDiscount(input) {
  const type = clean(input.discountType);
  if (!dues.DISCOUNT_TYPES.includes(type)) throw new Error('نوع الخصم غير صحيح.');
  const value = type ? Number(input.discountValue) : 0;
  if (type && (!Number.isFinite(value) || value < 0)) throw new Error('قيمة الخصم يجب أن تكون رقمًا لا يقل عن صفر.');
  if (type === 'percent' && value > 100) throw new Error('نسبة الخصم لا يمكن أن تتجاوز 100٪.');
  if (type && value === 0) throw new Error('أدخل قيمة الخصم أو اختر «بدون خصم».');
  return { discountType: type, discountValue: type ? value : 0, discountReason: type ? clean(input.discountReason) : '' };
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
    notes: clean(s.notes),
    gender: clean(s.gender),
    status: clean(s.status) || dues.ACTIVE_STATUS,
    leaveDate: clean(s.leaveDate),
    discountType: '', discountValue: 0, discountReason: ''
  };
  data.students.push(student);
  const initialPaid = Math.max(0, Number(s.initialPaid) || 0);
  const paymentDate = clean(s.initialPaymentDate) || student.registrationDate;
  const registrationPaid = Math.min(initialPaid, dues.registrationFeeFor(feeSettings()));
  const monthlyPaid = Math.max(0, initialPaid - registrationPaid);
  if (registrationPaid > 0) {
    data.studentPayments.push({
      id: nextId('studentPayments'),
      invoiceNo: nextInvoiceNo(),
      studentId: student.id,
      month: 'رسوم التسجيل',
      paymentType: 'registration',
      amount: registrationPaid,
      date: paymentDate,
      notes: 'دفعة رسوم التسجيل عند تسجيل الطالب'
    });
  }
  if (monthlyPaid > 0) {
    data.studentPayments.push({
      id: nextId('studentPayments'),
      invoiceNo: nextInvoiceNo(),
      studentId: student.id,
      month: clean(s.initialPaymentMonth) || currentPaymentMonth(),
      paymentType: 'monthly',
      amount: monthlyPaid,
      date: paymentDate,
      notes: 'دفعة الرسوم الشهرية عند تسجيل الطالب'
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
    registrationDate: clean(s.registrationDate), notes: clean(s.notes),
    status: clean(s.status) || dues.ACTIVE_STATUS, leaveDate: clean(s.leaveDate)
  });
  save(); return student;
}

// A student no longer carries a fee; the only thing left to set on the account
// is the discount that scholarships and siblings earn on the monthly fee.
function updateStudentDiscount(id, input) {
  const student = data.students.find(s => Number(s.id) === Number(id));
  if (!student) throw new Error('الطالب غير موجود.');
  Object.assign(student, validateDiscount(input));
  save(); return student;
}

function deleteStudent(id) {
  const n = Number(id);
  data.students = data.students.filter(x => Number(x.id) !== n);
  data.studentPayments = data.studentPayments.filter(x => Number(x.studentId) !== n);
  save();
}

// Student payments now match the cap already enforced on staff salaries: the
// account cannot be paid beyond what it owes.
function assertWithinOutstanding(student, amount, excludePaymentId = null) {
  const payments = data.studentPayments.filter(x => Number(x.studentId) === Number(student.id) && Number(x.id) !== Number(excludePaymentId));
  // Future months are not current debt, but remain payable in advance up to the
  // balance scheduled for the school year.
  const outstanding = dues.ledgerFor(student, payments, feeSettings()).scheduledOutstanding;
  if (outstanding <= 0) throw new Error('لا توجد مستحقات غير مسددة على هذا الطالب.');
  if (amount > outstanding) throw new Error(`المتبقي على الطالب هو ${outstanding} أوقية.`);
}

// One receipt. Callers check the cap first, then save: `addStudentPayments`
// enters several at once and must weigh them against the balance together.
function pushStudentPayment(student, month, amount, date, notes) {
  const payment = { id:nextId('studentPayments'), invoiceNo:nextInvoiceNo(), studentId:Number(student.id), month,
    paymentType: month === dues.REGISTRATION ? 'registration' : 'monthly', amount, date, notes };
  data.studentPayments.push(payment);
  return payment;
}

function assertPaymentMonth(month) {
  if (month !== dues.REGISTRATION && !dues.MONTHS.includes(month)) throw new Error('اختر الرسم الذي تخصه الدفعة.');
}

function addStudentPayment(p) {
  const student = data.students.find(x => Number(x.id) === Number(p.studentId));
  if (!student) throw new Error('الطالب غير موجود.');
  const amount = Number(p.amount) || 0;
  const month = clean(p.month);
  if (!month || amount <= 0) throw new Error('أدخل الشهر والمبلغ بشكل صحيح.');
  assertPaymentMonth(month);
  assertWithinOutstanding(student, amount);
  const payment = pushStudentPayment(student, month, amount, clean(p.date) || new Date().toISOString().slice(0,10), clean(p.notes));
  save(); return payment;
}

// The fee form records a whole visit at once: what the family paid on the
// registration fee and on each month, one receipt per fee. The batch is weighed
// against the balance as a whole — checked one by one, each amount would be
// measured against a balance the others had not reduced yet, and the last of
// them could pass a cap the set as a whole breaks.
function addStudentPayments(input) {
  const student = data.students.find(x => Number(x.id) === Number(input && input.studentId));
  if (!student) throw new Error('الطالب غير موجود.');
  const date = clean(input.date) || new Date().toISOString().slice(0,10);
  const entries = (Array.isArray(input.entries) ? input.entries : [])
    .map(entry => ({ month: clean(entry.month), amount: dues.round2(Number(entry.amount) || 0) }));
  if (!entries.length) throw new Error('لم تُحدَّد أي دفعة لتسجيلها.');
  for (const entry of entries) {
    if (!entry.month || !(entry.amount > 0)) throw new Error('أدخل الشهر والمبلغ بشكل صحيح.');
    assertPaymentMonth(entry.month);
  }
  assertWithinOutstanding(student, dues.round2(entries.reduce((total, entry) => total + entry.amount, 0)));
  const payments = entries.map(entry => pushStudentPayment(student, entry.month, entry.amount, date, clean(input.notes)));
  save(); return payments;
}
function updateStudentPayment(id,p) {
  const payment = data.studentPayments.find(x=>Number(x.id)===Number(id)); if(!payment)throw new Error('الدفعة غير موجودة.');
  const student=data.students.find(x=>Number(x.id)===Number(payment.studentId)); if(!student)throw new Error('الطالب غير موجود.');
  const amount=Number(p.amount)||0, month=clean(p.month); if(!month||amount<=0)throw new Error('بيانات الدفعة غير صحيحة.');
  assertPaymentMonth(month);
  assertWithinOutstanding(student, amount, payment.id);
  Object.assign(payment,{month,paymentType: month === 'رسوم التسجيل' ? 'registration' : 'monthly',amount,date:clean(p.date)||payment.date,notes:clean(p.notes)}); if(!payment.invoiceNo) payment.invoiceNo=nextInvoiceNo(); save(); return payment;
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

module.exports={init,getData,getCoreData,getDepartments,addDepartment,updateDepartment,deleteDepartment,clearOperationalData,publicSettings,checkLogin,updateSettings,updateFeeSettings,addStudent,updateStudent,updateStudentDiscount,deleteStudent,addStudentPayment,addStudentPayments,updateStudentPayment,deleteStudentPayment,addTeacher,updateTeacher,deleteTeacher,addTeacherPayment,updateTeacherPayment,deleteTeacherPayment,addTeacherAdvance,updateTeacherAdvance,deleteTeacherAdvance,addExpense,updateExpense,deleteExpense, getExamData, saveExamSettings, saveExamRecord, deleteExamRecord,
};

// Reload within a transaction so separate server processes cannot overwrite stale state.
const readOperations = new Set(['getData', 'getCoreData', 'getDepartments', 'publicSettings', 'checkLogin', 'getExamData']);
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
