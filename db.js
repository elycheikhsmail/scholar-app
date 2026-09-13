const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync, backup } = require('node:sqlite');
const dues = require('./public/fees.js');

let data;
let filePath;
let sqlite;
// How the database was opened, so replaceDatabase() can reopen it the same way.
let lastInit = null;
const COLLECTIONS = ['departments', 'students', 'studentPayments', 'teachers',
  'teacherPayments', 'teacherAdvances', 'expenses', 'exams', 'users'];
// Accounts. The developer account is built in: it alone imports or exports the
// database, and no admin can see, edit or remove it. Admins create the others.
const ROLES = ['developer', 'admin', 'secretary', 'supervisor'];
const ASSIGNABLE_ROLES = ['admin', 'secretary', 'supervisor'];
const DEVELOPER_USERNAME = 'developer';
const DEFAULT_PASSWORD = '36485606';
const DEFAULT_DEVELOPER_PASSWORD = 'Dev@2026';

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
// While a batch runs, every operation shares one transaction and one in-memory
// state; the writes go out once, when the batch ends.
let batching = false;
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
    regional: 'الإدارة الجهوية للتعليم',
    staffRoles: ['أستاذ', 'معلم', 'محاسب', 'مراقب', 'عامل يدوي', 'أخرى']
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
  exams: [],
  users: []
};

const clean = value => value == null ? '' : String(value).trim();
const clone = value => JSON.parse(JSON.stringify(value));

// Who is doing the writing. The server names the signed-in account through
// `as(username)` for each request; scripts and tests leave it empty. Every
// record then carries who created it and who last changed it, so the log
// answers « من سجّل هذا الوصل؟ » without a separate journal.
let actor = null;
function stampNew(record) {
  record.createdAt = new Date().toISOString();
  if (actor) record.createdBy = actor;
  return record;
}
function stampUpdate(record) {
  record.updatedAt = new Date().toISOString();
  if (actor) record.updatedBy = actor;
  return record;
}
// Live rows of a receipt collection: a cancelled receipt stays in the register
// but counts for nothing (allocation, caps, totals).
const live = rows => rows.filter(r => !r.cancelled);

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
  if (batching && connection === sqlite) return;
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
  lastInit = { baseDir, options };
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
      ensureUsers(options.initialUsers);
    } else {
      data = fs.existsSync(legacyPath) ? JSON.parse(fs.readFileSync(legacyPath, 'utf8')) : clone(DEFAULT_DATA);
      if (!fs.existsSync(legacyPath) && options.initialSettings) data.settings = clone(options.initialSettings);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Fichier JSON de migration invalide.');
      for (const key of COLLECTIONS) {
        if (key in data && !Array.isArray(data[key])) throw new Error(`Collection JSON invalide: ${key}`);
      }
      normalizeData();
      ensureUsers(options.initialUsers);
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
  for (const key of ['departments','students','studentPayments','teachers','teacherPayments','teacherAdvances','expenses','exams','users']) {
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
  // Receipt numbers come from sequences that never decrease: `nextId` reuses
  // the id of a deleted receipt, which would print the same number twice.
  for (const collection of Object.keys(RECEIPT_SERIES)) {
    const series = RECEIPT_SERIES[collection];
    data[series.key] = Math.max(Number(data[series.key]) || 0, highestReceiptSequence(collection));
    const used = new Set();
    data[collection].forEach(p => {
      if (!p[series.field] || used.has(p[series.field])) p[series.field] = nextReceiptNo(collection);
      used.add(p[series.field]);
    });
  }
  data.studentPayments.forEach(p => { if (!p.paymentType) p.paymentType = p.month === 'رسوم التسجيل' ? 'registration' : 'monthly'; });
  const feeMap = new Map(DEFAULT_DATA.departments.map(d => [d.name, d.monthlyFee]));
  data.departments = data.departments.map((d, i) => ({ ...d, id: Number(d.id) || i + 1, name: clean(d.name), monthlyFee: d.monthlyFee != null && Number.isFinite(Number(d.monthlyFee)) ? Math.max(0, Number(d.monthlyFee)) : Number(feeMap.get(clean(d.name)) || 0) }));
  const existingNames = new Set(data.departments.map(d => clean(d.name)));
  for (const d of DEFAULT_DATA.departments) { if (!existingNames.has(d.name)) data.departments.push({ ...clone(d), id: nextId('departments') }); }
}

// A database from before the accounts (one settings.username/passwordHash)
// turns that login into its admin on first open; the developer account is
// added to every database. `initialUsers` seeds a database created empty
// (mode switch) with the accounts of the one it was created from.
function ensureUsers(initialUsers) {
  if (!Array.isArray(data.users)) data.users = [];
  if (!data.users.length && Array.isArray(initialUsers) && initialUsers.length) data.users = clone(initialUsers);
  let changed = false;
  if (!data.users.some(u => u.role === 'admin')) {
    data.users.push({ id: nextId('users'), username: clean(data.settings.username) || 'admin', role: 'admin',
      passwordHash: data.settings.passwordHash || hashPassword(DEFAULT_PASSWORD), createdAt: new Date().toISOString() });
    changed = true;
  }
  if (!data.users.some(u => u.role === 'developer')) {
    data.users.push({ id: nextId('users'), username: DEVELOPER_USERNAME, role: 'developer',
      passwordHash: hashPassword(DEFAULT_DEVELOPER_PASSWORD), createdAt: new Date().toISOString() });
    changed = true;
  }
  if ('passwordHash' in data.settings) { delete data.settings.passwordHash; changed = true; }
  if (changed) save(sqlite, new Set(['users']));
}

function nextId(collection) {
  return data[collection].reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
}

// Receipts keep `date` as YYYY-MM-DD (filters compare it as text) and record
// the local time of entry separately, for display next to the invoice.
function currentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}
// One numbered series per kind of receipt: student invoices (F-), salary
// receipts (S-) and advance receipts (A-).
const RECEIPT_SERIES = {
  studentPayments: { prefix: 'F', key: 'invoiceSequence', field: 'invoiceNo' },
  teacherPayments: { prefix: 'S', key: 'salaryReceiptSequence', field: 'receiptNo' },
  teacherAdvances: { prefix: 'A', key: 'advanceReceiptSequence', field: 'receiptNo' }
};
function receiptSequenceOf(prefix, number) {
  const match = new RegExp(`^${prefix}-(\\d+)$`).exec(String(number || ''));
  return match ? Number(match[1]) : 0;
}
function highestReceiptSequence(collection) {
  const series = RECEIPT_SERIES[collection];
  return data[collection].reduce((m, p) => Math.max(m, receiptSequenceOf(series.prefix, p[series.field]), Number(p.id) || 0), 0);
}
function nextReceiptNo(collection) {
  const series = RECEIPT_SERIES[collection];
  // Databases created before the sequence existed resume after the highest number issued.
  if (data[series.key] == null) data[series.key] = highestReceiptSequence(collection);
  data[series.key] = (Number(data[series.key]) || 0) + 1;
  return `${series.prefix}-${String(data[series.key]).padStart(6, '0')}`;
}
const nextInvoiceNo = () => nextReceiptNo('studentPayments');

function publicSettings() {
  return {
    schoolName: data.settings.schoolName,
    schoolYear: data.settings.schoolYear,
    // The admin's login name; the read-only web copy proposes it on its login form.
    username: data.users.find(u => u.role === 'admin')?.username || data.settings.username,
    registrationFee: Math.max(0, Number(data.settings.registrationFee) || 0),
    defaultMonthlyFee: Math.max(0, Number(data.settings.defaultMonthlyFee) || 0),
    managerName: data.settings.managerName || '',
    managerPhone: data.settings.managerPhone || '',
    schoolPhone: data.settings.schoolPhone || '',
    republic: data.settings.republic || 'الجمهورية الإسلامية الموريتانية',
    ministry: data.settings.ministry || 'وزارة التعليم',
    regional: data.settings.regional || 'الإدارة الجهوية للتعليم',
    staffRoles: staffRoles(),
    testDate: clean(data.settings.testDate),
    testDateIssued: clean(data.settings.testDateIssued),
    // Remote read-only copy (NOTES-WEB-READONLY.md): the token never leaves the server.
    syncUrl: clean(data.settings.syncUrl),
    syncTokenSet: !!clean(data.settings.syncToken),
    ...syncState()
  };
}

// --- Remote read-only copy ---------------------------------------------------
// The desktop pushes a snapshot of everything the browser reads to the web
// copy; the web copy only serves it back. Credentials never travel: the
// snapshot carries the public settings, not the password hash.
function snapshot() {
  const exams = getExamData();
  return { exportedAt: new Date().toISOString(), ...getCoreData(), examSettings: exams.settings, exams: exams.exams };
}
function syncSettings() {
  return { url: clean(data.settings.syncUrl), token: clean(data.settings.syncToken) };
}
function updateSyncSettings(input) {
  const url = clean(input.syncUrl);
  if (url && !/^https?:\/\/\S+$/.test(url)) throw new Error('رابط المزامنة يجب أن يبدأ بـ http:// أو https://');
  data.settings.syncUrl = url;
  // An empty token keeps the one already stored, so the form need not repeat it.
  if (clean(input.syncToken)) data.settings.syncToken = clean(input.syncToken);
  if (!url) data.settings.syncToken = '';
  save();
  return publicSettings();
}
// When the copy was last refreshed and how many writes happened since: state
// of this installation, kept in `metadata` next to the schema version rather
// than in the school's data, so backups, exports and snapshots never carry it.
const metadataValue = key => sqlite.prepare('SELECT value FROM metadata WHERE key = ?').get(key)?.value;
const setMetadata = (key, value) => sqlite.prepare('INSERT INTO metadata(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
function syncState() {
  return { lastSyncAt: metadataValue('lastSyncAt') || '', writesSinceSync: Math.max(0, Number(metadataValue('writesSinceSync')) || 0) };
}
// Called once the web copy has confirmed it stored the snapshot.
function recordSync(at) {
  setMetadata('lastSyncAt', clean(at) || new Date().toISOString());
  setMetadata('writesSinceSync', 0);
  return publicSettings();
}

// A test database can carry the day it was prepared for (scripts/seed-testing.js
// dates every record up to it). The browser adopts it once per issue on each
// device, so the balances and dues open on the day the data was made for.
function setTestDate(date) {
  const value = clean(date);
  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('تاريخ الاختبار يجب أن يكون بصيغة YYYY-MM-DD.');
  data.settings.testDate = value;
  data.settings.testDateIssued = value ? new Date().toISOString() : '';
  save();
  return publicSettings();
}

function getData() { return clone(data); }
function getCoreData() {
  // Settings go through publicSettings() and accounts stay out: neither the
  // browser nor the web snapshot ever receives a password hash.
  const result = { settings: publicSettings() };
  for (const key of Object.keys(data)) {
    if (key === 'exams' || key === 'examSettings' || key === 'settings' || key === 'users') continue;
    result[key] = clone(data[key]);
  }
  return result;
}
// --- Accounts ----------------------------------------------------------------
const publicUser = user => ({ id: user.id, username: user.username, role: user.role });
const sameName = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();
function findUser(username) { return data.users.find(u => sameName(u.username, username)) || null; }
function userById(id) {
  const user = data.users.find(u => Number(u.id) === Number(id));
  if (!user) throw new Error('المستخدم غير موجود.');
  return user;
}
function assertUsername(username, except = null) {
  const value = clean(username);
  if (!value) throw new Error('اسم المستخدم مطلوب.');
  if (value.length > 40) throw new Error('اسم المستخدم طويل جدًا.');
  if (data.users.some(u => u !== except && sameName(u.username, value))) throw new Error('اسم المستخدم مستعمل مسبقًا.');
  return value;
}
function assertPassword(password) {
  if (String(password ?? '').length < 4) throw new Error('كلمة المرور قصيرة جدًا.');
  return String(password);
}
// The last admin keeps the role: a school without an admin could no longer manage accounts.
function assertNotLastAdmin(user) {
  if (user.role === 'admin' && data.users.filter(u => u.role === 'admin').length === 1) throw new Error('لا يمكن إزالة آخر مدير للنظام.');
}
function checkLogin(username, password) {
  const user = findUser(username);
  return user && verifyPassword(password, user.passwordHash) ? publicUser(user) : null;
}
// Admins never see the developer account; the developer sees everyone.
function listUsers(viewerRole) {
  return data.users.filter(u => viewerRole === 'developer' || u.role !== 'developer').map(publicUser);
}
function addUser(input) {
  if (!ASSIGNABLE_ROLES.includes(clean(input.role))) throw new Error('نوع المستخدم غير صحيح.');
  const user = { id: nextId('users'), username: assertUsername(input.username), role: clean(input.role),
    passwordHash: hashPassword(assertPassword(input.password)), createdAt: new Date().toISOString() };
  data.users.push(user); save();
  return publicUser(user);
}
function updateUser(id, input) {
  const user = userById(id);
  if (user.role === 'developer') throw new Error('لا يمكن تعديل حساب المطوّر من هنا.');
  if (input.username !== undefined) user.username = assertUsername(input.username, user);
  if (input.role !== undefined && clean(input.role) !== user.role) {
    if (!ASSIGNABLE_ROLES.includes(clean(input.role))) throw new Error('نوع المستخدم غير صحيح.');
    assertNotLastAdmin(user);
    user.role = clean(input.role);
  }
  if (input.password !== undefined && input.password !== '') user.passwordHash = hashPassword(assertPassword(input.password));
  save();
  return publicUser(user);
}
function deleteUser(id) {
  const user = userById(id);
  if (user.role === 'developer') throw new Error('لا يمكن حذف حساب المطوّر.');
  assertNotLastAdmin(user);
  data.users = data.users.filter(u => u !== user); save();
}
function changePassword(id, currentPassword, newPassword) {
  const user = userById(id);
  if (!verifyPassword(currentPassword, user.passwordHash)) throw new Error('كلمة المرور الحالية غير صحيحة.');
  user.passwordHash = hashPassword(assertPassword(newPassword)); save();
  return publicUser(user);
}

function updateSettings(input) {
  if (!clean(input.schoolName)) throw new Error('اسم المدرسة مطلوب.');
  if (!clean(input.schoolYear)) throw new Error('السنة الدراسية مطلوبة.');
  data.settings.schoolName = clean(input.schoolName);
  data.settings.schoolYear = clean(input.schoolYear);
  data.settings.managerName = clean(input.managerName);
  data.settings.managerPhone = clean(input.managerPhone);
  data.settings.schoolPhone = clean(input.schoolPhone);
  data.settings.republic = clean(input.republic) || DEFAULT_DATA.settings.republic;
  data.settings.ministry = clean(input.ministry) || DEFAULT_DATA.settings.ministry;
  data.settings.regional = clean(input.regional) || DEFAULT_DATA.settings.regional;
  if (data.settings.managerPhone && !/^\d{8}$/.test(data.settings.managerPhone)) throw new Error('هاتف المدير يجب أن يتكون من 8 أرقام.');
  save();
  return publicSettings();
}

// The dues engine resolves every charge from the school's own fees, so it needs
// the levels alongside the settings row.
function feeSettings() { return { ...data.settings, departments: data.departments }; }

// «إعدادات الرسوم» : one registration fee for the school, and the fee of a level
// for any student whose department carries none.
// « أستاذ » is paid by the hour and « أخرى » is the fallback role: both stay in
// the list. Other roles are managed from the settings screen.
const PINNED_STAFF_ROLES = ['أستاذ', 'أخرى'];
function staffRoles() {
  const roles = Array.isArray(data.settings.staffRoles) ? data.settings.staffRoles.map(clean).filter(Boolean) : [];
  const list = roles.length ? [...new Set(roles)] : [...DEFAULT_DATA.settings.staffRoles];
  for (const pinned of PINNED_STAFF_ROLES) if (!list.includes(pinned)) list.push(pinned);
  return list;
}
function assertStaffRoleName(name, roles, except) {
  if (!name) throw new Error('أدخل اسم طبيعة العمل.');
  if (name.length > 40) throw new Error('اسم طبيعة العمل طويل جدًا.');
  if (roles.some((role, i) => role === name && i !== except)) throw new Error('طبيعة العمل هذه موجودة بالفعل.');
}
function addStaffRole(input) {
  const roles = staffRoles(), name = clean(input && input.name);
  assertStaffRoleName(name, roles);
  data.settings.staffRoles = [...roles, name];
  save();
  return publicSettings();
}
function updateStaffRole(index, input) {
  const roles = staffRoles(), i = Number(index), name = clean(input && input.name);
  if (!Number.isInteger(i) || i < 0 || i >= roles.length) throw new Error('طبيعة العمل غير موجودة.');
  if (PINNED_STAFF_ROLES.includes(roles[i])) throw new Error(`لا يمكن تغيير «${roles[i]}» لأن التطبيق يعتمد عليها.`);
  assertStaffRoleName(name, roles, i);
  const previous = roles[i];
  roles[i] = name;
  data.settings.staffRoles = roles;
  // Employees follow the renamed role so their records keep matching the list.
  data.teachers.forEach(t => { if (clean(t.role) === previous) t.role = name; });
  save();
  return publicSettings();
}
function deleteStaffRole(index) {
  const roles = staffRoles(), i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= roles.length) throw new Error('طبيعة العمل غير موجودة.');
  if (PINNED_STAFF_ROLES.includes(roles[i])) throw new Error(`لا يمكن حذف «${roles[i]}» لأن التطبيق يعتمد عليها.`);
  if (data.teachers.some(t => clean(t.role) === roles[i])) throw new Error('لا يمكن حذف طبيعة عمل مرتبطة بموظفين. عدِّل الموظفين أولًا.');
  roles.splice(i, 1);
  data.settings.staffRoles = roles;
  save();
  return publicSettings();
}

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
  const item = stampNew({ id: nextId('departments'), name: value, monthlyFee: fee });
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
  item.name = value; item.monthlyFee = fee; stampUpdate(item);
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
  stampNew(student);
  data.students.push(student);
  const initialPaid = Math.max(0, Number(s.initialPaid) || 0);
  const paymentDate = clean(s.initialPaymentDate) || student.registrationDate;
  const registrationPaid = Math.min(initialPaid, dues.registrationFeeFor(feeSettings()));
  const monthlyPaid = Math.max(0, initialPaid - registrationPaid);
  if (registrationPaid > 0) {
    data.studentPayments.push(stampNew({
      id: nextId('studentPayments'),
      invoiceNo: nextInvoiceNo(),
      studentId: student.id,
      month: 'رسوم التسجيل',
      paymentType: 'registration',
      amount: registrationPaid,
      date: paymentDate,
      time: currentTime(),
      notes: 'دفعة رسوم التسجيل عند تسجيل الطالب'
    }));
  }
  if (monthlyPaid > 0) {
    data.studentPayments.push(stampNew({
      id: nextId('studentPayments'),
      invoiceNo: nextInvoiceNo(),
      studentId: student.id,
      month: clean(s.initialPaymentMonth) || currentPaymentMonth(),
      paymentType: 'monthly',
      amount: monthlyPaid,
      date: paymentDate,
      time: currentTime(),
      notes: 'دفعة الرسوم الشهرية عند تسجيل الطالب'
    }));
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
  stampUpdate(student);
  save(); return student;
}

// A student no longer carries a fee; the only thing left to set on the account
// is the discount that scholarships and siblings earn on the monthly fee.
function updateStudentDiscount(id, input) {
  const student = data.students.find(s => Number(s.id) === Number(id));
  if (!student) throw new Error('الطالب غير موجود.');
  Object.assign(student, validateDiscount(input)); stampUpdate(student);
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
  const payments = live(data.studentPayments).filter(x => Number(x.studentId) === Number(student.id) && Number(x.id) !== Number(excludePaymentId));
  // Future months are not current debt, but remain payable in advance up to the
  // balance scheduled for the school year.
  const outstanding = dues.ledgerFor(student, payments, feeSettings()).scheduledOutstanding;
  if (outstanding <= 0) throw new Error('لا توجد مستحقات غير مسددة على هذا الطالب.');
  if (amount > outstanding) throw new Error(`المتبقي على الطالب هو ${outstanding} أوقية.`);
}

// One receipt. Callers check the cap first, then save: `addStudentPayments`
// enters several at once and must weigh them against the balance together.
function pushStudentPayment(student, month, amount, date, notes) {
  const payment = stampNew({ id:nextId('studentPayments'), invoiceNo:nextInvoiceNo(), studentId:Number(student.id), month,
    paymentType: month === dues.REGISTRATION ? 'registration' : 'monthly', amount, date, time: currentTime(), notes });
  data.studentPayments.push(payment);
  return payment;
}

function assertPaymentMonth(month) {
  if (month !== dues.REGISTRATION && !dues.MONTHS.includes(month)) throw new Error('اختر الرسم الذي تخصه الدفعة.');
}
// Salaries and advances belong to a school month: an unknown name would be
// treated as October by the due-date rule and never match the payroll sheet.
function assertSalaryMonth(month) {
  if (!dues.MONTHS.includes(month)) throw new Error('اختر شهر الراتب من أشهر السنة الدراسية.');
}
// Every dated record is filtered and reported by comparing the date as text,
// so a date in another format would silently drop out of the month's figures.
// Empty means «today» for the caller; anything else must be a real YYYY-MM-DD.
function assertDate(value, label = 'التاريخ') {
  const text = clean(value);
  if (!text) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const valid = match && new Date(`${text}T00:00:00`).getDate() === Number(match[3]);
  if (!valid) throw new Error(`${label} يجب أن يكون بصيغة YYYY-MM-DD.`);
  return text;
}
const todayIso = () => new Date().toISOString().slice(0,10);

function addStudentPayment(p) {
  const student = data.students.find(x => Number(x.id) === Number(p.studentId));
  if (!student) throw new Error('الطالب غير موجود.');
  const amount = Number(p.amount) || 0;
  const month = clean(p.month);
  if (!month || amount <= 0) throw new Error('أدخل الشهر والمبلغ بشكل صحيح.');
  assertPaymentMonth(month);
  assertWithinOutstanding(student, amount);
  const payment = pushStudentPayment(student, month, amount, assertDate(p.date, 'تاريخ الدفع') || todayIso(), clean(p.notes));
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
  const date = assertDate(input.date, 'تاريخ الدفع') || todayIso();
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
  assertNotCancelled(payment);
  const student=data.students.find(x=>Number(x.id)===Number(payment.studentId)); if(!student)throw new Error('الطالب غير موجود.');
  // The label is kept unless the caller sends one: the fees a receipt settles
  // follow from the allocation order, so the form no longer asks for it.
  const amount=Number(p.amount)||0, month=clean(p.month)||clean(payment.month); if(!month||amount<=0)throw new Error('بيانات الدفعة غير صحيحة.');
  assertPaymentMonth(month);
  assertWithinOutstanding(student, amount, payment.id);
  Object.assign(payment,{month,paymentType: month === 'رسوم التسجيل' ? 'registration' : 'monthly',amount,date:assertDate(p.date, 'تاريخ الدفع')||payment.date,notes:clean(p.notes)}); stampUpdate(payment); if(!payment.invoiceNo) payment.invoiceNo=nextInvoiceNo(); save(); return payment;
}
function deleteStudentPayment(id){data.studentPayments=data.studentPayments.filter(x=>Number(x.id)!==Number(id));save();}

// A receipt is never erased once issued: the paper copy exists and the series
// must stay continuous. Cancelling keeps it in the register, marked, with who
// cancelled it and why, and takes it out of every allocation and total.
const RECEIPT_LABELS = { studentPayments: 'الدفعة', teacherPayments: 'دفعة الراتب', teacherAdvances: 'السلفة' };
function assertNotCancelled(record) {
  if (record.cancelled) throw new Error('هذا الوصل ملغى ولا يمكن تعديله.');
}
function cancelReceipt(collection, id, input) {
  const record = data[collection].find(x => Number(x.id) === Number(id));
  if (!record) throw new Error(`${RECEIPT_LABELS[collection]} غير موجودة.`);
  if (record.cancelled) throw new Error('هذا الوصل ملغى أصلًا.');
  const reason = clean(input && input.reason);
  if (!reason) throw new Error('اذكر سبب الإلغاء.');
  if (reason.length > 200) throw new Error('سبب الإلغاء طويل جدًا.');
  Object.assign(record, { cancelled: true, cancelledAt: new Date().toISOString(), cancelReason: reason });
  if (actor) record.cancelledBy = actor;
  save(); return record;
}
const cancelStudentPayment = (id, input) => cancelReceipt('studentPayments', id, input);
const cancelTeacherPayment = (id, input) => cancelReceipt('teacherPayments', id, input);
const cancelTeacherAdvance = (id, input) => cancelReceipt('teacherAdvances', id, input);

// An employee who left keeps every record and only drops out of the payment
// lists: deleting a record would leave « محذوف » in the salary history.
const TEACHER_STATUSES=['active','stopped'];
function teacherStatusFields(t){
  const status=TEACHER_STATUSES.includes(clean(t.status))?clean(t.status):'active';
  const endDate=status==='stopped'?clean(t.endDate):'';
  if(status==='stopped'&&endDate&&!/^\d{4}-\d{2}-\d{2}$/.test(endDate))throw new Error('تاريخ نهاية الخدمة غير صحيح.');
  return {status,endDate};
}
function addTeacher(t) {
  const role=clean(t.role)||'أخرى';
  if(!staffRoles().includes(role))throw new Error('اختر طبيعة العمل من القائمة المحددة في الإعدادات.');
  const teacher={
    id:nextId('teachers'),name:clean(t.name),phone:clean(t.phone),role,
    stage:clean(t.stage),subject:clean(t.subject),fixedSalary:Math.max(0,Number(t.fixedSalary)||0),hourlyRate:Math.max(0,Number(t.hourlyRate)||0),
    startDate:clean(t.startDate)||new Date().toISOString().slice(0,10),notes:clean(t.notes),...teacherStatusFields(t)
  };
  if(!teacher.name)throw new Error('اسم الموظف مطلوب.');
  if(teacher.phone && !/^\d{8}$/.test(teacher.phone))throw new Error('الهاتف يجب أن يتكون من 8 أرقام.');
  stampNew(teacher);
  data.teachers.push(teacher);save();return teacher;
}
function updateTeacher(id,t){
  const teacher=data.teachers.find(x=>Number(x.id)===Number(id));if(!teacher)throw new Error('الموظف غير موجود.');
  const role=clean(t.role)||'أخرى';
  if(!staffRoles().includes(role))throw new Error('اختر طبيعة العمل من القائمة المحددة في الإعدادات.');
  Object.assign(teacher,{name:clean(t.name),phone:clean(t.phone),role,stage:clean(t.stage),subject:clean(t.subject),fixedSalary:Math.max(0,Number(t.fixedSalary)||0),hourlyRate:Math.max(0,Number(t.hourlyRate)||0),startDate:clean(t.startDate),notes:clean(t.notes),...teacherStatusFields(t)});
  stampUpdate(teacher);
  save();return teacher;
}
function deleteTeacher(id){const n=Number(id);data.teachers=data.teachers.filter(x=>Number(x.id)!==n);data.teacherPayments=data.teacherPayments.filter(x=>Number(x.teacherId)!==n);data.teacherAdvances=data.teacherAdvances.filter(x=>Number(x.teacherId)!==n);save();}
// القاعدة: الراتب لا يُستحق إلا في اليوم الأخير من الشهر؛ قبله تُسجَّل سلفة فقط.
function assertSalaryEarned(month,date){
  const dueDate=dues.salaryDueDate(month,dues.startYearOf(data.settings.schoolYear));
  if(!dues.salaryEarnedOn(month,dues.startYearOf(data.settings.schoolYear),date))throw new Error(`راتب شهر ${month} لا يُستحق إلا في اليوم الأخير من الشهر (${dueDate})؛ قبل ذلك تُسجَّل سلفة.`);
}
// What the month is worth for this employee: the browser's estimate when it
// sent one, otherwise the employee's own figures (hours × rate, or the fixed salary).
function salaryEstimate(teacher,p){
  const hours=teacher.role==='أستاذ'?Math.max(0,Number(p.hours)||0):0;
  const hourlyRate=teacher.role==='أستاذ'?Math.max(0,Number(p.hourlyRate)||teacher.hourlyRate||0):0;
  const salaryDue=teacher.role==='أستاذ'?Math.max(0,Number(p.salaryDue)||hours*hourlyRate):Math.max(0,Number(p.salaryDue)||teacher.fixedSalary||0);
  return {hours,hourlyRate,salaryDue};
}
const sumMonth=(rows,teacherId,month,exceptId=null)=>live(rows).filter(x=>Number(x.teacherId)===Number(teacherId)&&clean(x.month)===month&&Number(x.id)!==Number(exceptId)).reduce((a,x)=>a+Number(x.amount||0),0);
// A month cannot receive more than it is worth, advances included. The cashier
// may still record a deliberate extra (bonus, arrears) after confirming in the
// form: the payment is then flagged `extra`, so the exception stays visible in
// the log and on the receipt instead of passing as an ordinary salary.
function assertSalaryWithinDue(teacher,month,amount,salaryDue,exceptId=null){
  if(salaryDue<=0)return;
  const available=salaryDue-sumMonth(data.teacherPayments,teacher.id,month,exceptId)-sumMonth(data.teacherAdvances,teacher.id,month);
  if(amount>available)throw new Error(`الدفعة تتجاوز المتاح لهذا الشهر (${dues.round2(Math.max(0,available))} أوقية) بعد احتساب السلف والدفعات الأخرى.`);
}
function addTeacherPayment(p){
  const teacher=data.teachers.find(x=>Number(x.id)===Number(p.teacherId));if(!teacher)throw new Error('الموظف غير موجود.');
  const amount=Number(p.amount)||0, month=clean(p.month);if(!month||amount<=0)throw new Error('بيانات الراتب غير صحيحة.');
  assertSalaryMonth(month);
  const date=assertDate(p.date,'تاريخ الدفع')||todayIso();
  assertSalaryEarned(month,date);
  const estimate=salaryEstimate(teacher,p);
  const extra=Boolean(p.extra);
  if(!extra)assertSalaryWithinDue(teacher,month,amount,estimate.salaryDue);
  const payment=stampNew({id:nextId('teacherPayments'),receiptNo:nextReceiptNo('teacherPayments'),teacherId:teacher.id,month,amount,date,time:currentTime(),notes:clean(p.notes),...estimate,...(extra?{extra:true}:{})});
  data.teacherPayments.push(payment);save();return payment;
}
function updateTeacherPayment(id,p){
  const payment=data.teacherPayments.find(x=>Number(x.id)===Number(id));
  if(!payment)throw new Error('دفعة الراتب غير موجودة.');
  assertNotCancelled(payment);
  const teacher=data.teachers.find(x=>Number(x.id)===Number(payment.teacherId));
  if(!teacher)throw new Error('الموظف غير موجود.');
  const amount=Number(p.amount)||0, month=clean(p.month);
  if(!month||amount<=0)throw new Error('بيانات الراتب غير صحيحة.');
  assertSalaryMonth(month);
  const estimate=salaryEstimate(teacher,p);
  // An extra stays an extra when edited; the flag is only ever set by the form.
  const extra=p.extra!==undefined?Boolean(p.extra):Boolean(payment.extra);
  if(!extra)assertSalaryWithinDue(teacher,month,amount,estimate.salaryDue,payment.id);
  const date=assertDate(p.date,'تاريخ الدفع')||payment.date;
  assertSalaryEarned(month,date);
  Object.assign(payment,{month,amount,date,notes:clean(p.notes),...estimate});
  if(extra)payment.extra=true;else delete payment.extra;
  stampUpdate(payment);
  save();return payment;
}
function deleteTeacherPayment(id){data.teacherPayments=data.teacherPayments.filter(x=>Number(x.id)!==Number(id));save();}
// An advance is capped by what the month is worth. Without an estimate from the
// form, a fixed salary is known from the employee's record; an hourly employee's
// month is worth nothing until the hours are entered, so only then is it capped.
function advanceDue(teacher,p,fallback=0){
  const sent=Math.max(0,Number(p.salaryDue)||0);
  if(sent>0)return sent;
  if(fallback>0)return fallback;
  return teacher.role==='أستاذ'?0:Math.max(0,Number(teacher.fixedSalary)||0);
}
function assertAdvanceWithinDue(teacher,month,amount,due,exceptId=null){
  if(due<=0)return;
  const available=due-sumMonth(data.teacherAdvances,teacher.id,month,exceptId)-sumMonth(data.teacherPayments,teacher.id,month);
  if(amount>available)throw new Error(`السلفة أكبر من المتاح لهذا الشهر (${dues.round2(Math.max(0,available))} أوقية).`);
}
function addTeacherAdvance(p){
  const teacher=data.teachers.find(x=>Number(x.id)===Number(p.teacherId));if(!teacher)throw new Error('الموظف غير موجود.');
  const amount=Number(p.amount)||0,month=clean(p.month);if(!month||amount<=0)throw new Error('بيانات السلفة غير صحيحة.');
  assertSalaryMonth(month);
  const due=advanceDue(teacher,p);
  assertAdvanceWithinDue(teacher,month,amount,due);
  const advance=stampNew({id:nextId('teacherAdvances'),receiptNo:nextReceiptNo('teacherAdvances'),teacherId:teacher.id,month,amount,date:assertDate(p.date,'تاريخ السلفة')||todayIso(),time:currentTime(),notes:clean(p.notes),salaryDue:due});
  data.teacherAdvances.push(advance);save();return advance;
}
function updateTeacherAdvance(id,p){
  const advance=data.teacherAdvances.find(x=>Number(x.id)===Number(id));
  if(!advance)throw new Error('السلفة غير موجودة.');
  assertNotCancelled(advance);
  const teacher=data.teachers.find(x=>Number(x.id)===Number(advance.teacherId));
  if(!teacher)throw new Error('الموظف غير موجود.');
  const amount=Number(p.amount)||0,month=clean(p.month);
  if(!month||amount<=0)throw new Error('بيانات السلفة غير صحيحة.');
  assertSalaryMonth(month);
  const due=advanceDue(teacher,p,Number(advance.salaryDue)||0);
  assertAdvanceWithinDue(teacher,month,amount,due,advance.id);
  Object.assign(advance,{month,amount,date:assertDate(p.date,'تاريخ السلفة')||advance.date,notes:clean(p.notes),salaryDue:due});
  stampUpdate(advance);
  save();return advance;
}
function deleteTeacherAdvance(id){data.teacherAdvances=data.teacherAdvances.filter(x=>Number(x.id)!==Number(id));save();}

// The same checks on entry and on edit: an edit cannot leave an expense without
// a category or with a zero amount that entry would have refused.
function expenseFields(e,previousDate){
  const fields={category:clean(e.category),description:clean(e.description),amount:Math.max(0,Number(e.amount)||0),date:assertDate(e.date,'تاريخ المصروف')||previousDate,beneficiary:clean(e.beneficiary),notes:clean(e.notes)};
  if(!fields.category||fields.amount<=0)throw Error('نوع المصروف والمبلغ مطلوبان.');
  return fields;
}
function addExpense(e){const o=stampNew({id:nextId('expenses'),...expenseFields(e,todayIso())});data.expenses.push(o);save();return o;}
function updateExpense(id,e){const o=data.expenses.find(x=>Number(x.id)===Number(id));if(!o)throw Error('المصروف غير موجود.');Object.assign(o,expenseFields(e,o.date));stampUpdate(o);save();return o;}
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
  if(idx>=0){const previous=data.exams[idx];if(previous.createdAt)rec.createdAt=previous.createdAt;if(previous.createdBy)rec.createdBy=previous.createdBy;stampUpdate(rec);data.exams[idx]=rec;}
  else{stampNew(rec);data.exams.push(rec);}
  save(); return clone(rec);
}
function deleteExamRecord(id){data.exams=data.exams.filter(x=>Number(x.id)!==Number(id));save();}

module.exports={init,getData,getCoreData,getDepartments,addDepartment,updateDepartment,deleteDepartment,clearOperationalData,publicSettings,setTestDate,snapshot,syncSettings,updateSyncSettings,recordSync,checkLogin,listUsers,addUser,updateUser,deleteUser,changePassword,updateSettings,updateFeeSettings,addStaffRole,updateStaffRole,deleteStaffRole,addStudent,updateStudent,updateStudentDiscount,deleteStudent,addStudentPayment,addStudentPayments,updateStudentPayment,deleteStudentPayment,cancelStudentPayment,cancelTeacherPayment,cancelTeacherAdvance,addTeacher,updateTeacher,deleteTeacher,addTeacherPayment,updateTeacherPayment,deleteTeacherPayment,addTeacherAdvance,updateTeacherAdvance,deleteTeacherAdvance,addExpense,updateExpense,deleteExpense, getExamData, saveExamSettings, saveExamRecord, deleteExamRecord,
};

// Reload within a transaction so separate server processes cannot overwrite stale state.
const readOperations = new Set(['getData', 'getCoreData', 'getDepartments', 'publicSettings', 'checkLogin', 'listUsers', 'getExamData', 'snapshot', 'syncSettings']);
// Bookkeeping of the sync itself, and accounts (never part of the snapshot),
// are not changes the web copy is missing.
const uncountedWrites = new Set(['updateSyncSettings', 'recordSync', 'setTestDate', 'addUser', 'updateUser', 'deleteUser', 'changePassword']);
function countWrite() {
  sqlite.prepare(`INSERT INTO metadata(key, value) VALUES ('writesSinceSync', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`).run();
}
for (const [name, operation] of Object.entries(module.exports)) {
  if (name === 'init') continue;
  const run = args => {
    const backupPath = name === 'clearOperationalData' ? createBackup() : null;
    const result = operation(...(backupPath ? [backupPath] : args));
    if (!readOperations.has(name) && !uncountedWrites.has(name)) countWrite();
    return result;
  };
  module.exports[name] = (...args) => {
    if (!sqlite) throw new Error('La base de données doit être initialisée.');
    if (batching) return run(args);
    sqlite.exec(readOperations.has(name) ? 'BEGIN' : 'BEGIN IMMEDIATE');
    try {
      data = readData();
      const result = run(args);
      sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      data = undefined;
      throw error;
    }
  };
}
// The same operations, signed: `db.as(username).addStudent(...)` records who
// did it. The name is set for the duration of the (synchronous) call only, so
// two requests awaiting their bodies cannot sign each other's writes.
function as(username) {
  const signed = {};
  for (const [name, operation] of Object.entries(module.exports)) {
    if (typeof operation !== 'function') continue;
    signed[name] = (...args) => {
      actor = clean(username) || null;
      try { return operation(...args); } finally { actor = null; }
    };
  }
  return signed;
}
module.exports.as = as;
// Many operations in one transaction: one read, one write, one fsync instead
// of one of each per record. An error anywhere rolls the whole batch back.
// Meant for the seeding scripts, which record thousands of receipts in a row.
function batch(fn) {
  if (!sqlite) throw new Error('La base de données doit être initialisée.');
  if (batching) return fn();
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    data = readData();
    batching = true;
    let result;
    try { result = fn(); } finally { batching = false; }
    save();
    sqlite.exec('COMMIT');
    return result;
  } catch (error) {
    sqlite.exec('ROLLBACK');
    data = undefined;
    throw error;
  }
}
module.exports.batch = batch;
module.exports.close = close;

// --- Whole-database export / import (developer) ------------------------------
// Both go through SQLite's online backup: one consistent file, WAL included,
// with no `-wal`/`-shm` companions — so the exported file can be copied to
// another machine and imported as is.
async function exportDatabase(destination) {
  if (!sqlite) throw new Error('La base de données doit être initialisée.');
  await backup(sqlite, destination);
  return destination;
}
// Checks a file before it replaces the school's data: a real SQLite file of
// this application's schema that passes the integrity check. Returns the
// record counts so the caller can tell what it is about to import.
function validateDatabaseFile(file) {
  const header = Buffer.alloc(16);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, header, 0, 16, 0); } finally { fs.closeSync(fd); }
  if (header.toString() !== 'SQLite format 3\0') throw new Error('الملف ليس قاعدة بيانات SQLite.');
  const source = new DatabaseSync(file, { readOnly: true });
  try {
    if (source.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('قاعدة البيانات تالفة.');
    const tables = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
    for (const table of ['metadata', 'settings', ...COLLECTIONS.filter(c => c !== 'users')]) {
      if (!tables.has(table)) throw new Error('الملف ليس قاعدة بيانات هذا البرنامج.');
    }
    const version = source.prepare("SELECT value FROM metadata WHERE key = 'schemaVersion'").get();
    if (!version || version.value !== '1') throw new Error('إصدار قاعدة البيانات غير مدعوم.');
    const counts = {};
    for (const table of COLLECTIONS) counts[table] = tables.has(table) ? source.prepare(`SELECT count(*) AS n FROM "${table}"`).get().n : 0;
    return counts;
  } finally {
    source.close();
    // A read-only connection cannot fold the WAL companions it created; they are empty.
    for (const suffix of ['-wal', '-shm']) fs.rmSync(file + suffix, { force: true });
  }
}
// Replaces the open database with `file` (already validated): the current one
// is backed up first, the connection closed (which folds the WAL in), the file
// moved into place and the database reopened. If reopening fails, the backup
// is put back so the school never ends up without a working database.
async function replaceDatabase(file) {
  if (!sqlite || !lastInit) throw new Error('La base de données doit être initialisée.');
  const backupDir = path.join(path.dirname(filePath), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `before-import-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
  await backup(sqlite, backupPath);
  const target = filePath;
  close();
  for (const suffix of ['-wal', '-shm']) fs.rmSync(target + suffix, { force: true });
  fs.renameSync(file, target);
  try {
    init(lastInit.baseDir, lastInit.options);
  } catch (error) {
    fs.copyFileSync(backupPath, target);
    for (const suffix of ['-wal', '-shm']) fs.rmSync(target + suffix, { force: true });
    init(lastInit.baseDir, lastInit.options);
    throw new Error(`تعذر فتح القاعدة المستوردة، وأُعيدت القاعدة السابقة: ${error.message}`, { cause: error });
  }
  return backupPath;
}
module.exports.exportDatabase = exportDatabase;
module.exports.validateDatabaseFile = validateDatabaseFile;
module.exports.replaceDatabase = replaceDatabase;
module.exports.ROLES = ROLES;
module.exports.ASSIGNABLE_ROLES = ASSIGNABLE_ROLES;
module.exports.DEVELOPER_USERNAME = DEVELOPER_USERNAME;
