const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const db = require('../db');
const { clearFees } = require('../scripts/clear-fees');
const { applyFees } = require('../scripts/apply-fees');
const { OFFICIAL_LEVELS } = require('../scripts/official-fees');

test('clearing the fees deletes empty levels, zeroes the ones with pupils, then the official list replaces them', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-clear-fees-'));
  try {
    db.init(dir);
    const pupil = db.addStudent({ schoolNo: 'P-1', name: 'طالب', gender: 'ذكر', nni: '1111111111', className: '1AS' });
    db.addStudentPayment({ studentId: pupil.id, month: 'أكتوبر', amount: 500 });
    const before = db.getData(); db.close();

    const preview = await clearFees(dir, { dryRun: true });
    assert.equal(preview.deleted.length, before.departments.length - 1);
    assert.deepEqual(preview.zeroed.map(l => [l.name, l.students]), [['1AS', 1]]);
    db.init(dir); assert.deepEqual(db.getData(), before); db.close();

    const report = await clearFees(dir);
    assert.ok(fs.existsSync(report.backupPath));
    db.init(dir);
    let data = db.getData();
    assert.deepEqual(data.departments.map(d => [d.name, d.monthlyFee]), [['1AS', 0]]);
    assert.deepEqual(data.students, before.students);
    assert.deepEqual(data.studentPayments, before.studentPayments);
    db.close();

    await applyFees(dir);
    db.init(dir);
    data = db.getData();
    const byName = list => list.slice().sort((a, b) => a[0].localeCompare(b[0]));
    assert.deepEqual(byName(data.departments.map(d => [d.name, d.monthlyFee])), byName(OFFICIAL_LEVELS.map(l => [l.name, l.fee])));
    assert.equal(data.students[0].className, '1AS');
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
