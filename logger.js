// Journal d'erreurs persistant : logs/app.log dans le dossier des données
// (userData sous Electron, le projet pour `npm run server`). Chaque ligne est
// horodatée ; le fichier est tourné au-delà de MAX_BYTES (app.1.log … app.3.log)
// pour qu'un bureau qui tourne des mois ne remplisse pas le disque.
// Avant `init`, tout part seulement sur la console (tests, scripts).
const fs = require("fs");
const path = require("path");

const MAX_BYTES = 2 * 1024 * 1024;
const KEEP = 3;
let logDir = null;
let logFile = null;
let maxBytes = MAX_BYTES;
let handlersInstalled = false;

function init(dir, options = {}) {
  const target = path.join(dir, "logs");
  if (logDir === target) return logFile;
  fs.mkdirSync(target, { recursive: true });
  logDir = target;
  logFile = path.join(target, "app.log");
  maxBytes = options.maxBytes || MAX_BYTES;
  return logFile;
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Texte d'une valeur jointe au message : la pile d'une erreur, sinon du JSON.
function describe(value) {
  if (value === undefined) return "";
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function rotate() {
  let size = 0;
  try { size = fs.statSync(logFile).size; } catch { return; }
  if (size < maxBytes) return;
  for (let index = KEEP - 1; index >= 1; index--) {
    const from = path.join(logDir, `app.${index}.log`);
    if (fs.existsSync(from)) fs.renameSync(from, path.join(logDir, `app.${index + 1}.log`));
  }
  fs.renameSync(logFile, path.join(logDir, "app.1.log"));
}

function write(level, message, ...details) {
  const extra = details.map(describe).filter(Boolean);
  const line = [`${timestamp()} [${level}] ${message}`, ...extra].join("\n  ") + "\n";
  const printer = level === "INFO" ? console.log : console.error;
  printer(line.trimEnd());
  if (!logFile) return;
  try {
    rotate();
    fs.appendFileSync(logFile, line);
  } catch (error) {
    // Un disque plein ou un dossier en lecture seule ne doit jamais faire tomber l'application.
    console.error("تعذر الكتابة في ملف السجل:", error.message);
  }
}

const info = (message, ...details) => write("INFO", message, ...details);
const warn = (message, ...details) => write("WARN", message, ...details);
const error = (message, ...details) => write("ERROR", message, ...details);

// Les erreurs non attrapées sont journalisées puis le processus continue :
// sur le bureau, un plantage silencieux sans trace est pire qu'une fenêtre qui reste ouverte.
function installProcessHandlers(target = process) {
  if (handlersInstalled) return;
  handlersInstalled = true;
  target.on("uncaughtException", err => error("UNCAUGHT EXCEPTION", err));
  target.on("unhandledRejection", reason => error("UNHANDLED REJECTION", reason instanceof Error ? reason : describe(reason)));
}

module.exports = { init, info, warn, error, installProcessHandlers, file: () => logFile, dir: () => logDir };
