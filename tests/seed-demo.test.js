const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const db = require('../db');
const { seedDemo } = require('../scripts/seed-demo');

test('demo data preserves existing records, backs up, and can be seeded twice without duplicates', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-demo-test-'));
  try {
    db.init(dir);
    db.addStudent({ schoolNo: 'EXISTING', name: 'Existing test record', gender: 'ذكر', nni: '9999999999', className: 'Jardin' });
    const before = db.getData(); db.close();
    const first = await seedDemo(dir);
    assert.equal(first.counts.students, 145);
    assert.equal(first.counts.studentPayments, 432);
    assert.equal(first.counts.teachers, 12);
    assert.equal(first.counts.exams, 288);
    db.init(dir); const seeded = db.getData(); db.close();
    assert.deepEqual(seeded.students[0], before.students[0]);
    assert.deepEqual(seeded.settings, before.settings);
    const second = await seedDemo(dir);
    assert.deepEqual(second.counts, first.counts);
    db.init(dir); assert.deepEqual(db.getData(), seeded); db.close();
    const restored = path.join(dir, 'restored'); fs.mkdirSync(path.join(restored, 'database'), { recursive: true });
    fs.copyFileSync(first.backupPath, path.join(restored, 'database', 'school-data.sqlite'));
    db.init(restored); assert.deepEqual(db.getData(), before);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
