const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const zlib = require("zlib");
const db = require("./db");
const APP_VERSION = (() => {
  try { return require("./package.json").version; }
  catch(error) {
    if (error.code !== "MODULE_NOT_FOUND") throw error;
    return process.env.npm_package_version || "development";
  }
})();

const DEFAULT_PORT = Number(process.env.SCHOOL_PORT || 3780);
const HOST = process.env.SCHOOL_HOST || "127.0.0.1";
const publicDir = path.join(__dirname, "public");
const sessions = new Map();
const SESSION_TTL = Number(process.env.SCHOOL_SESSION_TTL_MS || 12 * 60 * 60 * 1000);
const LOGIN_WINDOW = 5 * 60 * 1000;
const LOGIN_ATTEMPTS = 8;
const loginFailures = new Map();
let server = null;
let actualPort = DEFAULT_PORT;
let applicationMode = 'production';
let modeGeneration = 0;
// Read-only copy (SCHOOL_READ_ONLY=1): the web deployment and any mirror serve
// the data but refuse every change. The browser hides the forms; the server
// still refuses, so a stale page cannot write either.
let readOnly = false;
const READ_ONLY_MESSAGE = 'هذه النسخة للعرض فقط؛ لا يمكن الحفظ أو التعديل.';
function modeInfo() {
  const info = { mode: applicationMode, label: applicationMode === 'test' ? 'نسخة للتجريب فقط' : 'وضع الإنتاج', version:APP_VERSION, readOnly };
  // Only a test database proposes a test date; production always runs on the real day.
  if (applicationMode === 'test') {
    const { testDate, testDateIssued } = db.publicSettings();
    if (testDate) Object.assign(info, { testDate, testDateIssued });
  }
  return info;
}
function publicSettings() { return { ...db.publicSettings(), applicationMode, version:APP_VERSION }; }
function modeFile() { return path.join(baseDir(), 'database', 'application-mode.json'); }
function readMode() {
  if (!fs.existsSync(modeFile())) return 'production';
  const mode = JSON.parse(fs.readFileSync(modeFile(), 'utf8')).mode;
  if (!['production','test'].includes(mode)) throw new Error('إعداد وضع التطبيق غير صحيح.');
  return mode;
}
function switchMode(mode) {
  if (!['production','test'].includes(mode)) throw new Error('وضع التطبيق غير صحيح.');
  if (mode === applicationMode) return;
  const previous = applicationMode;
  const { settings: initialSettings, users: initialUsers } = db.getData();
  const temporary = modeFile() + '.tmp';
  try {
    db.init(baseDir(), { mode, initialSettings, initialUsers });
    fs.writeFileSync(temporary, JSON.stringify({mode}), {mode:0o600});
    fs.renameSync(temporary, modeFile());
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    db.init(baseDir(), {mode:previous});
    throw error;
  }
  applicationMode = mode;
  modeGeneration++;
  sessions.clear();
}


function baseDir() {
  if (process.versions.electron) return require("electron").app.getPath("userData");
  return __dirname;
}

const LOOPBACK_ORIGIN = /^https?:\/\/(127\.0\.0\.1|\[::1\]|localhost)(:\d+)?$/;
function json(res, status, payload) {
  const text = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Confirm-Password",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
  };
  // Recorded once per request, so every response answers the same way.
  if (LOOPBACK_ORIGIN.test(res.corsOrigin || "")) headers["Access-Control-Allow-Origin"] = res.corsOrigin;
  res.writeHead(status, headers);
  res.end(text);
}

function getToken(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

function auth(req) {
  const token = getToken(req);
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL) { sessions.delete(token); return null; }
  return session;
}
function openSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { createdAt: Date.now(), user });
  return token;
}

// Who may change what. Reads are open to every account; the secretary records
// the school's daily work; settings, sync and the reset stay with the admin;
// accounts with the admin and the developer; the database with the developer alone.
const ADMIN_ROUTES = new Set(['mode', 'departments', 'fee-settings', 'staff-roles', 'settings', 'sync-settings', 'sync-remote', 'reset-data']);
const SELF_ROUTES = new Set(['logout', 'verify-password', 'password']);
const PERMISSION_MESSAGE = 'ليست لديك صلاحية لهذه العملية.';
function allowed(role, route, method) {
  if (route === 'database') return role === 'developer';
  if (route === 'users') return role === 'admin' || role === 'developer';
  if (method === 'GET' || SELF_ROUTES.has(route)) return true;
  if (ADMIN_ROUTES.has(route)) return role === 'admin' || role === 'developer';
  return role === 'admin' || role === 'developer' || role === 'secretary';
}

function clientKey(req) {
  return req.socket.remoteAddress || 'local';
}

// Throttle repeated failures so the password cannot be ground down locally.
function loginBlocked(req) {
  const record = loginFailures.get(clientKey(req));
  if (!record) return 0;
  if (Date.now() - record.first > LOGIN_WINDOW) { loginFailures.delete(clientKey(req)); return 0; }
  return record.count >= LOGIN_ATTEMPTS ? Math.ceil((LOGIN_WINDOW - (Date.now() - record.first)) / 1000) : 0;
}

function noteLoginFailure(req) {
  const key = clientKey(req);
  const record = loginFailures.get(key);
  if (!record || Date.now() - record.first > LOGIN_WINDOW) loginFailures.set(key, { first: Date.now(), count: 1 });
  else record.count++;
}

function body(req) {
  const generation = modeGeneration;
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        req.destroy();
        reject(new Error("البيانات كبيرة جدًا."));
      }
    });
    req.on("end", () => {
      if (generation !== modeGeneration) return reject(new Error("تم تغيير وضع التطبيق. أعد تسجيل الدخول قبل إعادة المحاولة."));
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error("بيانات غير صحيحة.")); }
    });
    req.on("error", reject);
  });
}

// The database import arrives as raw bytes, not JSON.
const IMPORT_LIMIT = 512 * 1024 * 1024;
function rawBody(req, limit = IMPORT_LIMIT) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > limit) { req.destroy(); return reject(new Error("الملف كبير جدًا.")); }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendFile(res, urlPath) {
  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.normalize(path.join(publicDir, relative));
  const publicRoot = path.resolve(publicDir) + path.sep;

  if (!(file === path.resolve(publicDir) || file.startsWith(publicRoot))) {
    return json(res, 403, { error: "Forbidden" });
  }

  fs.readFile(file, (err, buffer) => {
    if (err) return json(res, 404, { error: "Not found" });
    const ext = path.extname(file).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg"
    };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(buffer);
  });
}

async function api(req, res) {
  const u = new URL(req.url, "http://localhost");
  const parts = u.pathname.split("/").filter(Boolean);
  const method = req.method;

  res.corsOrigin = req.headers.origin || "";
  if (method === "OPTIONS") return json(res, 204, {});
  if (parts[0] !== "api") return sendFile(res, u.pathname);

  if (parts[1] === "mode" && method === "GET") return json(res, 200, modeInfo());

  if (parts[1] === "login" && method === "POST") {
    const wait = loginBlocked(req);
    if (wait) return json(res, 429, { error: `محاولات كثيرة. أعد المحاولة بعد ${wait} ثانية.` });
    const b = await body(req);
    const user = db.checkLogin(b.username, b.password);
    if (!user) {
      noteLoginFailure(req);
      return json(res, 401, { error: "اسم المستخدم أو كلمة المرور غير صحيحة." });
    }
    loginFailures.delete(clientKey(req));
    return json(res, 200, { token: openSession(user), settings: publicSettings(), user });
  }

  if (parts[1] === "settings" && method === "GET") {
    return json(res, 200, publicSettings());
  }

  const session = auth(req);
  if (!session) return json(res, 401, { error: "يجب تسجيل الدخول." });
  const { user } = session;
  if (!allowed(user.role, parts[1], method)) return json(res, 403, { error: PERMISSION_MESSAGE });

  if (parts[1] === "logout" && method === "POST") {
    sessions.delete(getToken(req));
    return json(res, 200, { ok: true });
  }

  // Confirming a sensitive action re-checks the password without minting a
  // session: going through /login left one unused 12h token behind each time.
  if (parts[1] === "verify-password" && method === "POST") {
    const wait = loginBlocked(req);
    if (wait) return json(res, 429, { error: `محاولات كثيرة. أعد المحاولة بعد ${wait} ثانية.` });
    const b = await body(req);
    // 403, not 401: the session is valid, only the confirmation failed. A 401
    // makes the client treat the session as expired and reload.
    if (!db.checkLogin(user.username, b.password)) {
      noteLoginFailure(req);
      return json(res, 403, { error: "كلمة المرور غير صحيحة." });
    }
    loginFailures.delete(clientKey(req));
    return json(res, 200, { ok: true });
  }

  // The page learns who is signed in with the data it loads (also after a mode switch).
  if (parts[1] === "data" && method === "GET") {
    return json(res, 200, { ...db.getCoreData(), user });
  }
  if (readOnly && method !== "GET" && parts[1] !== "verify-password") return json(res, 405, { error: READ_ONLY_MESSAGE });

  try {
    if (parts[1] === "mode" && method === "PUT") {
      const input = await body(req);
      switchMode(input.mode);
      return json(res, 200, {...modeInfo(), token: openSession(user), settings:publicSettings(), user});
    }

    // Whole database, developer only (allowed() keeps everyone else out). Each
    // action re-checks the developer's password: it can overwrite real data.
    if (parts[1] === "database" && parts[2] === "export" && method === "POST") {
      const b = await body(req);
      if (!db.checkLogin(user.username, b.password)) { noteLoginFailure(req); return json(res, 403, { error: "كلمة المرور غير صحيحة." }); }
      // A school year weighs a few megabytes: the copy is read whole and the
      // temporary file is gone before the first byte leaves.
      const file = path.join(baseDir(), 'database', `export-${Date.now()}.sqlite`);
      let copy;
      try { await db.exportDatabase(file); copy = fs.readFileSync(file); }
      finally { fs.rmSync(file, { force: true }); }
      const stamp = new Date().toISOString().slice(0, 10);
      const headers = { "Content-Type": "application/vnd.sqlite3", "Content-Length": copy.length,
        "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="school-data-${stamp}.sqlite"` };
      if (LOOPBACK_ORIGIN.test(res.corsOrigin || "")) headers["Access-Control-Allow-Origin"] = res.corsOrigin;
      res.writeHead(200, headers);
      return res.end(copy);
    }
    if (parts[1] === "database" && parts[2] === "import" && method === "POST") {
      const password = decodeURIComponent(req.headers["x-confirm-password"] || "");
      if (!db.checkLogin(user.username, password)) { noteLoginFailure(req); return json(res, 403, { error: "كلمة المرور غير صحيحة." }); }
      const upload = await rawBody(req);
      const temporary = path.join(baseDir(), 'database', `import-${Date.now()}.tmp`);
      fs.writeFileSync(temporary, upload, { mode: 0o600 });
      let counts;
      try {
        counts = db.validateDatabaseFile(temporary);
        const backup = await db.replaceDatabase(temporary);
        // Every session belonged to the previous database's accounts.
        sessions.clear();
        modeGeneration++;
        return json(res, 200, { ok: true, backup, counts });
      } finally {
        fs.rmSync(temporary, { force: true });
      }
    }

    // Accounts: admins manage the school's users, everyone changes their own password.
    if (parts[1] === "users" && method === "GET") return json(res, 200, db.listUsers(user.role));
    if (parts[1] === "users" && method === "POST") return json(res, 200, db.addUser(await body(req)));
    if (parts[1] === "users" && method === "PUT") return json(res, 200, db.updateUser(parts[2], await body(req)));
    if (parts[1] === "users" && method === "DELETE") {
      if (Number(parts[2]) === Number(user.id)) return json(res, 400, { error: "لا يمكنك حذف حسابك الحالي." });
      db.deleteUser(parts[2]);
      // Whoever was signed in on the removed account is out.
      for (const [token, other] of sessions) if (Number(other.user.id) === Number(parts[2])) sessions.delete(token);
      return json(res, 200, { ok: true });
    }
    if (parts[1] === "password" && method === "PUT") {
      const b = await body(req);
      return json(res, 200, { ok: true, user: db.changePassword(user.id, b.currentPassword, b.newPassword) });
    }
    if (parts[1] === "exams" && method === "GET") return json(res, 200, db.getExamData());
    if (parts[1] === "exam-settings" && method === "PUT") return json(res, 200, db.saveExamSettings(await body(req)));
    if (parts[1] === "exam-records" && method === "POST") return json(res, 200, db.saveExamRecord(await body(req)));
    if (parts[1] === "exam-records" && method === "DELETE") { db.deleteExamRecord(parts[2]); return json(res, 200, { ok: true }); }

    if (parts[1] === "fee-settings" && method === "PUT") return json(res, 200, db.updateFeeSettings(await body(req)));
    if (parts[1] === "staff-roles" && method === "POST") return json(res, 200, db.addStaffRole(await body(req)));
    if (parts[1] === "staff-roles" && method === "PUT") return json(res, 200, db.updateStaffRole(parts[2], await body(req)));
    if (parts[1] === "staff-roles" && method === "DELETE") return json(res, 200, db.deleteStaffRole(parts[2]));

    if (parts[1] === "departments" && method === "GET") return json(res, 200, db.getDepartments());
    if (parts[1] === "departments" && method === "POST") return json(res, 200, db.addDepartment(await body(req)));
    if (parts[1] === "departments" && method === "PUT") return json(res, 200, db.updateDepartment(parts[2], await body(req)));
    if (parts[1] === "departments" && method === "DELETE") { db.deleteDepartment(parts[2]); return json(res, 200, { ok: true }); }

    if (parts[1] === "students" && method === "POST") return json(res, 200, db.addStudent(await body(req)));
    if (parts[1] === "students" && parts[3] === "discount" && method === "PUT") return json(res, 200, db.updateStudentDiscount(parts[2], await body(req)));
    if (parts[1] === "students" && method === "PUT") return json(res, 200, db.updateStudent(parts[2], await body(req)));
    if (parts[1] === "students" && method === "DELETE") { db.deleteStudent(parts[2]); return json(res, 200, { ok: true }); }

    if (parts[1] === "student-payments" && parts[2] === "batch" && method === "POST") return json(res, 200, db.addStudentPayments(await body(req)));
    if (parts[1] === "student-payments" && method === "POST") return json(res, 200, db.addStudentPayment(await body(req)));
    if (parts[1] === "student-payments" && method === "PUT") return json(res, 200, db.updateStudentPayment(parts[2], await body(req)));
    if (parts[1] === "student-payments" && method === "DELETE") { db.deleteStudentPayment(parts[2]); return json(res, 200, { ok: true }); }

    if (parts[1] === "teachers" && method === "POST") return json(res, 200, db.addTeacher(await body(req)));
    if (parts[1] === "teachers" && method === "PUT") return json(res, 200, db.updateTeacher(parts[2], await body(req)));
    if (parts[1] === "teachers" && method === "DELETE") { db.deleteTeacher(parts[2]); return json(res, 200, { ok: true }); }

    if (parts[1] === "teacher-payments" && method === "POST") return json(res, 200, db.addTeacherPayment(await body(req)));
    if (parts[1] === "teacher-payments" && method === "PUT") return json(res, 200, db.updateTeacherPayment(parts[2], await body(req)));
    if (parts[1] === "teacher-payments" && method === "DELETE") { db.deleteTeacherPayment(parts[2]); return json(res, 200, { ok: true }); }

    if (parts[1] === "teacher-advances" && method === "POST") return json(res, 200, db.addTeacherAdvance(await body(req)));
    if (parts[1] === "teacher-advances" && method === "PUT") return json(res, 200, db.updateTeacherAdvance(parts[2], await body(req)));
    if (parts[1] === "teacher-advances" && method === "DELETE") { db.deleteTeacherAdvance(parts[2]); return json(res, 200, { ok: true }); }

    if (parts[1] === "expenses" && method === "POST") return json(res, 200, db.addExpense(await body(req)));
    if (parts[1] === "expenses" && method === "PUT") return json(res, 200, db.updateExpense(parts[2], await body(req)));
    if (parts[1] === "expenses" && method === "DELETE") { db.deleteExpense(parts[2]); return json(res, 200, { ok: true }); }

    if (parts[1] === "reset-data" && method === "POST") {
      const b = await body(req);
      if (!db.checkLogin(user.username, b.password)) return json(res, 403, { error: "كلمة المرور غير صحيحة." });
      const backup = db.clearOperationalData();
      return json(res, 200, { ok: true, backup });
    }

    // Remote read-only copy: where to push the snapshot, and the push itself.
    if (parts[1] === "sync-settings" && method === "PUT") {
      const b = await body(req);
      if (!db.checkLogin(user.username, b.currentPassword)) return json(res, 403, { error: "كلمة المرور الحالية غير صحيحة." });
      return json(res, 200, { ok: true, settings: { ...db.updateSyncSettings(b), applicationMode } });
    }
    if (parts[1] === "sync-remote" && method === "POST") {
      const result = await syncRemote();
      return json(res, result.ok ? 200 : 502, result.ok ? { ...result, settings: publicSettings() } : { error: result.error });
    }

    if (parts[1] === "settings" && method === "PUT") {
      const b = await body(req);
      if (!db.checkLogin(user.username, b.currentPassword)) return json(res, 403, { error: "كلمة المرور الحالية غير صحيحة." });
      return json(res, 200, { ok: true, settings: { ...db.updateSettings(b), applicationMode } });
    }
  } catch (error) {
    console.error("API ERROR:", error);
    return json(res, 400, { error: error.message || "حدث خطأ." });
  }

  return json(res, 404, { error: "المسار غير موجود." });
}

// Pushes the snapshot to the web copy (POST, bearer token). Never throws: the
// desktop must keep working offline, so the outcome is a result object.
async function syncRemote({ timeout = 20000 } = {}) {
  try {
    // Test data must never replace the school's real data on the web copy.
    if (applicationMode === 'test') return { ok: false, error: "المزامنة متاحة في وضع الإنتاج فقط." };
    const { url, token } = db.syncSettings();
    if (!url) return { ok: false, error: "لم يُضبط رابط المزامنة بعد (الإعدادات ← المزامنة)." };
    if (!token) return { ok: false, error: "لم يُضبط رمز المزامنة بعد (الإعدادات ← المزامنة)." };
    const snapshot = db.snapshot();
    // Gzipped: a full year of receipts and marks fits well under the size
    // limit of a serverless function, and the upload is ten times faster.
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/gzip", Authorization: `Bearer ${token}` },
      body: zlib.gzipSync(JSON.stringify(snapshot)),
      signal: AbortSignal.timeout(timeout)
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      return { ok: false, error: detail.error || `رفض الموقع المزامنة (HTTP ${response.status}).` };
    }
    const settings = db.recordSync(snapshot.exportedAt);
    return { ok: true, lastSyncAt: settings.lastSyncAt, records: Object.values(snapshot).filter(Array.isArray).reduce((n, list) => n + list.length, 0) };
  } catch (error) {
    return { ok: false, error: error.name === "TimeoutError" ? "انتهت مهلة الاتصال بالموقع." : `تعذر الاتصال بالموقع: ${error.message}` };
  }
}

function canListen(port) {
  return new Promise((resolve, reject) => {
    const tester = http.createServer();
    tester.once("error", error => { try { tester.close(); } catch {} ; reject(error); });
    tester.once("listening", () => tester.close(() => resolve(true)));
    tester.listen(port, HOST);
  });
}

async function findFreePort() {
  if (await canListen(DEFAULT_PORT).catch(error => error.code === "EADDRINUSE" ? false : Promise.reject(error))) return DEFAULT_PORT;
  for (let port = DEFAULT_PORT + 1; port <= DEFAULT_PORT + 20; port++) {
    const ok = await canListen(port).catch(error => error.code === "EADDRINUSE" ? false : Promise.reject(error));
    if (ok) return port;
  }
  throw new Error("لم يتم العثور على منفذ متاح بين 3780 و3800.");
}

async function startServer() {
  if (server && server.listening) {
    return {
      url: `http://127.0.0.1:${actualPort}`,
      port: actualPort,
      addresses: networkAddresses(actualPort),
      close: closeServer
    };
  }

  applicationMode = readMode();
  readOnly = process.env.SCHOOL_READ_ONLY === '1';
  db.init(baseDir(), {mode:applicationMode});
  actualPort = await findFreePort();

  server = http.createServer((req, res) => {
    api(req, res).catch(error => {
      console.error("SERVER ERROR:", error);
      if (!res.headersSent) json(res, 500, { error: error.message || "خطأ داخلي في الخادم." });
      else res.end();
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(actualPort, HOST, resolve);
  });

  const addresses = networkAddresses(actualPort);
  console.log("========================================");
  console.log("تم تشغيل خادم حسابات المدرسة بنجاح.");
  console.log(`Local: http://127.0.0.1:${actualPort}`);
  for (const address of addresses) console.log(`Network: ${address}`);
  console.log("========================================");

  return { url: `http://127.0.0.1:${actualPort}`, port: actualPort, addresses, close: closeServer };
}

function closeServer() {
  sessions.clear();
  if (!server) return;
  try { server.close(); } catch (error) { console.error("خطأ أثناء إغلاق الخادم:", error); }
  server = null;
}

function networkAddresses(port) {
  if (HOST === "127.0.0.1" || HOST === "::1") return [];
  const out = [];
  for (const xs of Object.values(os.networkInterfaces())) {
    for (const info of xs || []) {
      if (info.family === "IPv4" && !info.internal) out.push(`http://${info.address}:${port}`);
    }
  }
  return [...new Set(out)];
}

if (require.main === module) {
  startServer().catch(error => {
    console.error("تعذر تشغيل خادم حسابات المدرسة:", error);
    process.exitCode = 1;
  });
}

module.exports = { startServer, syncRemote };
