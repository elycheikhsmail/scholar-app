const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const db = require('../../db');

test('browser scripts support login, all sections, student fees and session restoration', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'school-ui-'));
  t.after(() => { db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  db.init(directory);
  db.addStudent({ name: 'طالب تجريبي', schoolNo: 'UI1', nni: '1234567890', className: '6AF', gender: 'ذكر' });
  db.addTeacher({ name: 'موظف تجريبي', role: 'معلم', fixedSalary: 5000 });
  const settings = { ...db.publicSettings(), applicationMode: 'production', version:require('../../package.json').version };
  const responses = {
    '/api/mode': { mode: 'production' },
    '/api/settings': settings,
    '/api/login': { token: 'ui-test-token', settings },
    '/api/logout': { ok: true },
    '/api/data': db.getCoreData(),
    '/api/departments': db.getDepartments(),
    '/api/exams': db.getExamData()
  };
  db.close();
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.E2E_BROWSER_PATH ? { executablePath: process.env.E2E_BROWSER_PATH } : {})
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(request.url()));
  const publicDir = path.resolve(__dirname, '../../public');
  await page.route('http://school.test/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (Object.hasOwn(responses, pathname)) return route.fulfill({ json: responses[pathname] });
    const name = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!/^[a-z-]+\.(html|js|css)$/.test(name) || !fs.existsSync(path.join(publicDir, name))) {
      errors.push(`Unexpected request: ${pathname}`);
      return route.fulfill({ status: 404, body: 'Not found' });
    }
    const contentType = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html';
    return route.fulfill({ path: path.join(publicDir, name), contentType });
  });
  await page.goto('http://school.test/#students');
  await page.locator('#loginUsername').fill('test');
  await page.locator('#loginPassword').fill('test');
  await page.locator('#loginForm button').click();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#appVersion')).toHaveText(require('../../package.json').version);
  await expect(page.locator('#students')).toHaveClass(/active-section/);
  await expect(page).toHaveURL(/#students$/);
  for (const section of ['students', 'fees', 'collections', 'staff', 'expenses', 'exams', 'reports', 'settings', 'dashboard']) {
    await page.locator(`.nav-item[data-section="${section}"]`).click();
    await expect(page.locator(`#${section}`)).toHaveClass(/active-section/);
    await expect(page).toHaveURL(new RegExp(`#${section}$`));
  }
  await expect(page.locator('#sStudents')).toHaveText('1');
  await page.locator('.nav-item[data-section="students"]').click();
  await page.locator('#exportStudentsExcel').click();
  await expect(page.locator('#studentExportDialog')).toHaveAttribute('open', '');
  await page.locator('#clearStudentExport').click();
  await page.locator('[data-student-export-column="name"]').check();
  await page.locator('[data-student-export-column="className"]').check();
  const excelDownload=page.waitForEvent('download');
  await page.locator('#studentExportForm button.primary').click();
  const workbook=await excelDownload;
  await expect(page.locator('#studentExportDialog')).not.toHaveAttribute('open', '');
  assert.match(workbook.suggestedFilename(),/\.xlsx$/);
  const workbookStream=await workbook.createReadStream();
  const workbookChunks=[];
  for await(const chunk of workbookStream)workbookChunks.push(chunk);
  const workbookBytes=Buffer.concat(workbookChunks);
  assert.equal(workbookBytes.subarray(0,2).toString(),'PK');
  assert.match(workbookBytes.toString(),/xl\/worksheets\/sheet1\.xml/);
  assert.match(workbookBytes.toString(),/طالب تجريبي/);
  assert.ok(!workbookBytes.toString().includes('ولي الأمر'),'العمود غير المحدد لا يُصدَّر');
  await page.locator('.nav-item[data-section="staff"]').click();
  await page.locator('#teachersTable .btn-edit').click();
  await expect(page.locator('#teacherDialog')).toHaveAttribute('open', '');
  await expect(page.locator('#teacherName')).toHaveValue('موظف تجريبي');
  await page.keyboard.press('Escape');
  await expect(page.locator('#teacherDialog')).not.toHaveAttribute('open', '');
  await page.locator('#addTeacher').click();
  await expect(page.locator('#teacherDialog')).toHaveAttribute('open', '');
  await expect(page.locator('#teacherName')).toHaveValue('');
  await page.keyboard.press('Escape');
  await page.locator('.nav-item[data-section="students"]').click();
  await page.locator('.nav-item[data-section="fees"]').click();
  await page.goBack();
  await expect(page.locator('#students')).toHaveClass(/active-section/);
  await page.goForward();
  await expect(page.locator('#fees')).toHaveClass(/active-section/);
  await page.evaluate(() => { location.hash='page-inconnue'; });
  await expect(page).toHaveURL(/#dashboard$/);
  await page.locator('.nav-item[data-section="fees"]').click();
  await expect(page.locator('#feeQuickFilters button')).toHaveCount(4);
  await expect(page.locator('#feesHead')).not.toContainText('دفعة جديدة');
  await expect(page.locator('#feesTable [data-fee-column="payment"]')).toHaveCount(0);
  await expect(page.locator('#feesTable .fee-form-trigger').first()).toHaveText('+');
  await expect(page.locator('#feesTable .fee-form-trigger').first()).toHaveAttribute('aria-label', /فتح استمارة الرسوم/);
  await page.locator('.fee-column-picker summary').click();
  await page.locator('[data-fee-column-toggle="discount"]').uncheck();
  await expect(page.locator('#feesHead [data-fee-column="discount"]')).toBeHidden();
  assert.match(await page.evaluate(() => localStorage.getItem('feeHiddenColumns')), /discount/);
  await page.locator('#showAllFeeColumns').click();
  await expect(page.locator('#feesHead [data-fee-column="discount"]')).toBeVisible();
  await page.locator('#feeSearch').fill('غير موجود');
  await expect(page.locator('#feesFilterSummary')).toContainText('0');
  await page.locator('#resetFeeFilters').click();
  await expect(page.locator('#feeSearch')).toHaveValue('');
  await expect(page.locator('#feesTable')).toContainText('طالب تجريبي');
  // The filters, the chips and the rows all read from the one dues vocabulary.
  await expect(page.locator('#feeStatus option')).toHaveCount(5);
  await expect(page.locator('#feeStatus option').nth(2)).toHaveText('متأخر');
  await expect(page.locator('#feeQuickFilters button').nth(2)).toContainText('متأخر');
  // Every modal is built from the shared dialog system.
  for (const id of ['studentFeesPanel', 'studentLedgerDialog', 'studentExportDialog', 'teacherDialog']) {
    await expect(page.locator(`#${id}`)).toHaveClass(/app-dialog/);
  }
  // One colour per screen: the tokens keep two sections from sharing a value.
  const navColours = await page.evaluate(() => ['fees', 'collections', 'staff'].map(section =>
    getComputedStyle(document.querySelector(`.nav-item[data-section="${section}"]`)).color));
  assert.equal(new Set(navColours).size, navColours.length, 'each screen keeps its own colour');
  // No table renders as a blank strip any more.
  await page.locator('.nav-item[data-section="expenses"]').click();
  await expect(page.locator('#expensesTable')).toContainText('لا توجد مصروفات مسجلة');
  await page.locator('.nav-item[data-section="students"]').click();
  await page.locator('#studentsTable .btn-edit').click();
  await expect(page.locator('#studentName')).toHaveValue('طالب تجريبي');
  await page.locator('#studentsTable .btn-pay').click();
  await expect(page.locator('#studentFeesPanel')).toHaveAttribute('open', '');
  await expect(page.locator('#studentFeesPanel')).toBeVisible();
  // Editing a monthly fee shows the periods it covers and what a save would change.
  await expect(page.locator('#studentFeePeriods tr')).toHaveCount(1);
  await expect(page.locator('#studentFeePreview')).toContainText('لا يوجد تغيير');
  await expect(page.locator('#saveStudentFees')).toBeDisabled();
  await page.locator('#studentMonthlyFee').fill('7000');
  await expect(page.locator('#saveStudentFees')).toBeEnabled();
  await expect(page.locator('#studentFeePreview')).toContainText('يتغيّر');
  await page.locator('#resetStudentFees').click();
  await expect(page.locator('#saveStudentFees')).toBeDisabled();
  await page.locator('#showStudentLedger').click();
  await expect(page.locator('#studentLedgerDialog')).toHaveAttribute('open', '');
  await expect(page.locator('#studentLedger')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#studentLedgerDialog')).not.toHaveAttribute('open', '');
  await page.locator('#closeStudentFees').click();
  await expect(page.locator('#studentFeesPanel')).not.toHaveAttribute('open', '');
  await page.locator('#feesTable .fee-row-actions button').first().click();
  await expect(page.locator('#studentFeesPanel')).toHaveAttribute('open', '');
  await page.evaluate(() => sessionStorage.setItem('modeSwitchToken', 'replacement-token'));
  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('modeSwitchToken')), null);
  await page.locator('#logoutBtn').click();
  await expect(page.locator('#loginScreen')).toBeVisible();
  assert.deepEqual(errors, []);
});
