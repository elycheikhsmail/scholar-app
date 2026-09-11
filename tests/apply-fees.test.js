const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const db = require('../db');
const { applyFees } = require('../scripts/apply-fees');
const { OFFICIAL_LEVELS } = require('../scripts/official-fees');

test('official fees are loaded into production: levels updated or added, others and pupils kept, backup first', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-apply-fees-'));
  try {
    db.init(dir);
    const jardin = db.addStudent({ schoolNo: 'P-1', name: 'طالب الروضة', gender: 'ذكر', nni: '1111111111', className: 'Jardin' });
    const sixth = db.addStudent({ schoolNo: 'P-2', name: 'طالب السادسة', gender: 'أنثى', nni: '2222222222', className: '6AF' });
    db.addStudentPayment({ studentId: sixth.id, month: 'أكتوبر', amount: 500 });
    const before = db.getData(); db.close();

    const preview = await applyFees(dir, { dryRun: true });
    assert.equal(preview.dryRun, true);
    assert.ok(preview.updated.some(l => l.name === '6AF' && l.from === 12000 && l.to === 800 && l.students === 1));
    assert.ok(preview.added.some(l => l.name === 'الحضانة' && l.monthlyFee === 400));
    assert.ok(preview.kept.some(l => l.name === 'Jardin' && l.students === 1));
    db.init(dir); assert.deepEqual(db.getData(), before); db.close();

    const report = await applyFees(dir);
    assert.ok(fs.existsSync(report.backupPath));
    assert.deepEqual({ ...report, backupPath: null, dryRun: true }, preview);
    db.init(dir);
    const data = db.getData();
    for (const level of OFFICIAL_LEVELS) {
      const department = data.departments.find(d => d.name === level.name);
      assert.ok(department, level.name);
      assert.equal(department.monthlyFee, level.fee);
    }
    assert.equal(data.departments.find(d => d.name === 'Jardin').monthlyFee, 5000);
    assert.deepEqual(data.students, before.students);
    assert.deepEqual(data.studentPayments, before.studentPayments);
    assert.equal(data.students.find(s => s.id === jardin.id).className, 'Jardin');
    db.close();

    // A second run finds nothing to change.
    const again = await applyFees(dir, { dryRun: true });
    assert.deepEqual(again.updated, []); assert.deepEqual(again.added, []);
    assert.equal(again.unchanged.length, OFFICIAL_LEVELS.length);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
