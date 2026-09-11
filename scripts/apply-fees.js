// Loads the official monthly fee of every level into the PRODUCTION database.
// A level already present keeps its record (and its pupils) and takes the
// official fee; a missing level is added; any other level is left untouched
// and reported. Nothing else is changed. A backup is written first.
//
// The application may stay open: every server operation re-reads the database
// inside its own transaction. Reload the page afterwards to see the new fees.
//   node scripts/apply-fees.js                 → database/ of this folder
//   node scripts/apply-fees.js <dossier>       → another base directory (Electron: userData)
//   node scripts/apply-fees.js --dry-run       → show the changes, write nothing
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync, backup } = require('node:sqlite');
const db = require('../db');
const { OFFICIAL_LEVELS } = require('./official-fees');

async function backupProduction(baseDir) {
  const backupDir = path.join(baseDir, 'database', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `before-fees-${Date.now()}.sqlite`);
  const source = new DatabaseSync(path.join(baseDir, 'database', 'school-data.sqlite'), { readOnly: true });
  try { await backup(source, backupPath); } finally { source.close(); }
  return backupPath;
}

// The plan is computed first, then applied in one transaction unless this is a
// dry run — so the report is the same either way.
function planFees({ departments, students }) {
  const byName = new Map(departments.map(d => [d.name, d]));
  const count = name => students.filter(s => s.className === name).length;
  const plan = { updated: [], added: [], unchanged: [], kept: [] };
  for (const level of OFFICIAL_LEVELS) {
    const current = byName.get(level.name);
    if (!current) plan.added.push({ name: level.name, monthlyFee: level.fee });
    else if (Number(current.monthlyFee) !== level.fee) plan.updated.push({ id: current.id, name: level.name, from: Number(current.monthlyFee), to: level.fee, students: count(level.name) });
    else plan.unchanged.push(level.name);
  }
  // Levels the school does not list any more stay as they are: deleting one
  // with pupils is refused anyway, and renaming is the user's decision.
  for (const department of departments) {
    if (OFFICIAL_LEVELS.some(l => l.name === department.name)) continue;
    plan.kept.push({ name: department.name, monthlyFee: Number(department.monthlyFee), students: count(department.name) });
  }
  return plan;
}

async function applyFees(baseDir = path.resolve(__dirname, '..'), options = {}) {
  db.init(baseDir);
  try {
    const plan = planFees(db.getData());
    if (options.dryRun) return { dryRun: true, backupPath: null, ...plan };
    const backupPath = await backupProduction(baseDir);
    db.batch(() => {
      for (const level of plan.updated) db.updateDepartment(level.id, { name: level.name, monthlyFee: level.to });
      for (const level of plan.added) db.addDepartment({ name: level.name, monthlyFee: level.monthlyFee });
    });
    return { dryRun: false, backupPath, ...plan };
  } finally { db.close(); }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dir = args.find(a => !a.startsWith('--'));
  applyFees(dir ? path.resolve(dir) : undefined, { dryRun })
    .then(report => {
      console.log(JSON.stringify(report, null, 2));
      console.log(dryRun ? '\nتجربة فقط: لم يُكتب أي شيء.' : '\nتم تحميل الرسوم الشهرية الرسمية في قاعدة بيانات الإنتاج.');
    })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { applyFees };
