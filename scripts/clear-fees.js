// Empties the levels and monthly fees of the PRODUCTION database so the
// official list can take their place (scripts/apply-fees.js). A level without
// pupils is deleted; a level that still has pupils cannot be (the pupils are
// attached to it), so its monthly fee is set to zero and it is reported.
// Pupils, receipts, staff and settings are untouched. A backup is written first.
//
// The application may stay open: every server operation re-reads the database
// inside its own transaction. Reload the page afterwards.
//   node scripts/clear-fees.js                 → database/ of this folder
//   node scripts/clear-fees.js <dossier>       → another base directory (Electron: userData)
//   node scripts/clear-fees.js --dry-run       → show the changes, write nothing
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync, backup } = require('node:sqlite');
const db = require('../db');

async function backupProduction(baseDir) {
  const backupDir = path.join(baseDir, 'database', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `before-clear-fees-${Date.now()}.sqlite`);
  const source = new DatabaseSync(path.join(baseDir, 'database', 'school-data.sqlite'), { readOnly: true });
  try { await backup(source, backupPath); } finally { source.close(); }
  return backupPath;
}

function planClear({ departments, students }) {
  const plan = { deleted: [], zeroed: [] };
  for (const department of departments) {
    const count = students.filter(s => s.className === department.name).length;
    const entry = { id: department.id, name: department.name, monthlyFee: Number(department.monthlyFee), students: count };
    if (count) plan.zeroed.push(entry); else plan.deleted.push(entry);
  }
  return plan;
}

async function clearFees(baseDir = path.resolve(__dirname, '..'), options = {}) {
  db.init(baseDir);
  try {
    const plan = planClear(db.getData());
    if (options.dryRun) return { dryRun: true, backupPath: null, ...plan };
    const backupPath = await backupProduction(baseDir);
    db.batch(() => {
      for (const level of plan.deleted) db.deleteDepartment(level.id);
      for (const level of plan.zeroed) db.updateDepartment(level.id, { name: level.name, monthlyFee: 0 });
    });
    return { dryRun: false, backupPath, ...plan };
  } finally { db.close(); }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dir = args.find(a => !a.startsWith('--'));
  clearFees(dir ? path.resolve(dir) : undefined, { dryRun })
    .then(report => {
      console.log(JSON.stringify(report, null, 2));
      console.log(dryRun ? '\nتجربة فقط: لم يُكتب أي شيء.' : '\nتم تفريغ الفصول والرسوم الشهرية. لتحميل الرسوم الرسمية: npm run fees:apply');
    })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { clearFees };
