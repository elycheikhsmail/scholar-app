const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const db = require("./db");

const DEFAULT_PORT = Number(process.env.SCHOOL_PORT || 3780);
const HOST = process.env.SCHOOL_HOST || "127.0.0.1";
const publicDir = path.join(__dirname, "public");
const sessions = new Map();
let server = null;
let actualPort = DEFAULT_PORT;
let applicationMode = 'production';
let modeGeneration = 0;
function modeInfo() { return { mode: applicationMode, label: applicationMode === 'test' ? 'نسخة للتجريب فقط' : 'وضع الإنتاج' }; }
function publicSettings() { return { ...db.publicSettings(), applicationMode }; }
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
  const initialSettings = db.getData().settings;
  const temporary = modeFile() + '.tmp';
  try {
    db.init(baseDir(), { mode, initialSettings });
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

function json(res, status, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
  });
  res.end(text);
}

function getToken(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

function auth(req) {
  return sessions.has(getToken(req));
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

  if (method === "OPTIONS") return json(res, 204, {});
  if (parts[0] !== "api") return sendFile(res, u.pathname);

  if (parts[1] === "mode" && method === "GET") return json(res, 200, modeInfo());

  if (parts[1] === "login" && method === "POST") {
    const b = await body(req);
    if (!db.checkLogin(b.username, b.password)) {
      return json(res, 401, { error: "اسم المستخدم أو كلمة المرور غير صحيحة." });
    }
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { createdAt: Date.now() });
    return json(res, 200, { token, settings: publicSettings() });
  }

  if (parts[1] === "settings" && method === "GET") {
    return json(res, 200, publicSettings());
  }

  if (!auth(req)) return json(res, 401, { error: "يجب تسجيل الدخول." });

  if (parts[1] === "logout" && method === "POST") {
    sessions.delete(getToken(req));
    return json(res, 200, { ok: true });
  }

  if (parts[1] === "data" && method === "GET") {
    return json(res, 200, db.getData());
  }

  try {
    if (parts[1] === "mode" && method === "PUT") {
      const input = await body(req);
      switchMode(input.mode);
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, {createdAt:Date.now()});
      return json(res, 200, {...modeInfo(), token, settings:publicSettings()});
    }
    if (parts[1] === "exams" && method === "GET") return json(res, 200, db.getExamData());
    if (parts[1] === "exam-settings" && method === "PUT") return json(res, 200, db.saveExamSettings(await body(req)));
    if (parts[1] === "exam-records" && method === "POST") return json(res, 200, db.saveExamRecord(await body(req)));
    if (parts[1] === "exam-records" && method === "DELETE") { db.deleteExamRecord(parts[2]); return json(res, 200, { ok: true }); }

    if (parts[1] === "departments" && method === "GET") return json(res, 200, db.getDepartments());
    if (parts[1] === "departments" && method === "POST") return json(res, 200, db.addDepartment(await body(req)));
    if (parts[1] === "departments" && method === "PUT") return json(res, 200, db.updateDepartment(parts[2], await body(req)));
    if (parts[1] === "departments" && method === "DELETE") { db.deleteDepartment(parts[2]); return json(res, 200, { ok: true }); }

    if (parts[1] === "students" && method === "POST") return json(res, 200, db.addStudent(await body(req)));
    if (parts[1] === "students" && parts[3] === "fees" && method === "PUT") return json(res, 200, db.updateStudentFees(parts[2], await body(req)));
    if (parts[1] === "students" && method === "PUT") return json(res, 200, db.updateStudent(parts[2], await body(req)));
    if (parts[1] === "students" && method === "DELETE") { db.deleteStudent(parts[2]); return json(res, 200, { ok: true }); }

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
      const settings = db.publicSettings();
      if (!db.checkLogin(settings.username, b.password)) return json(res, 403, { error: "كلمة المرور غير صحيحة." });
      const backup = db.clearOperationalData();
      return json(res, 200, { ok: true, backup });
    }

    if (parts[1] === "settings" && method === "PUT") {
      const b = await body(req);
      const current = db.publicSettings();
      if (!db.checkLogin(current.username, b.currentPassword)) return json(res, 403, { error: "كلمة المرور الحالية غير صحيحة." });
      if (b.newPassword && b.newPassword.length < 4) return json(res, 400, { error: "كلمة المرور الجديدة قصيرة جدًا." });
      return json(res, 200, { ok: true, settings: { ...db.updateSettings(b), applicationMode } });
    }
  } catch (error) {
    console.error("API ERROR:", error);
    return json(res, 400, { error: error.message || "حدث خطأ." });
  }

  return json(res, 404, { error: "المسار غير موجود." });
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

module.exports = { startServer };
