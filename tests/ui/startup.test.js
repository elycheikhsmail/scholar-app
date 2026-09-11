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
  const teacher=db.addTeacher({ name: 'موظف تجريبي', role: 'معلم', fixedSalary: 5000 });
  db.addTeacherPayment({ teacherId:teacher.id, month:'أكتوبر', amount:3000, date:'2026-09-10', salaryDue:5000 });
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
  const salaryRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(request.url()));
  const publicDir = path.resolve(__dirname, '../../public');
  await page.route('http://school.test/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if(pathname==='/api/verify-password'){
      salaryRequests.push({path:pathname,body:route.request().postDataJSON()});
      return route.fulfill({json:{ok:true}});
    }
    if(/^\/api\/teacher-payments\/\d+$/.test(pathname)){
      salaryRequests.push({path:pathname,body:route.request().postDataJSON()});
      return route.fulfill({json:{ok:true}});
    }
    if (Object.hasOwn(responses, pathname)) return route.fulfill({ json: responses[pathname] });
    const name = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!/^[a-z-]+\.(html|js|css|jpg)$/.test(name) || !fs.existsSync(path.join(publicDir, name))) {
      errors.push(`Unexpected request: ${pathname}`);
      return route.fulfill({ status: 404, body: 'Not found' });
    }
    const contentType = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.jpg') ? 'image/jpeg' : 'text/html';
    return route.fulfill({ path: path.join(publicDir, name), contentType });
  });
  await page.goto('http://school.test/#students');
  await page.locator('#loginUsername').fill('test');
  await page.locator('#loginPassword').fill('test');
  await page.locator('#loginForm button').click();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('.topbar .app-icon')).toBeVisible();
  assert.ok(await page.locator('.topbar .app-icon').evaluate(image=>image.complete&&image.naturalWidth===1080));
  await expect(page.locator('#appVersion')).toHaveText(require('../../package.json').version);
  await expect(page.locator('#students')).toHaveClass(/active-section/);
  await expect(page).toHaveURL(/#students$/);
  await expect(page.locator('[data-page-back]')).toHaveCount(2);
  await expect(page.locator('[data-page-back]').first()).toBeDisabled();
  const [topBackBox,bottomBackBox]=await Promise.all([
    page.locator('[data-page-back]').first().boundingBox(),
    page.locator('[data-page-back]').last().boundingBox()
  ]);
  assert.ok(topBackBox.x>640,'the upper back button stays on the right');
  assert.ok(bottomBackBox.x<640,'the lower back button stays on the left');
  assert.ok(bottomBackBox.y>topBackBox.y,'the lower back button follows the page content');
  await page.locator('.nav-item[data-section="fees"]').click();
  await expect(page.locator('[data-page-back]').first()).toBeEnabled();
  await page.locator('[data-page-back]').first().click();
  await expect(page.locator('#students')).toHaveClass(/active-section/);
  await expect(page).toHaveURL(/#students$/);
  await expect(page.locator('[data-page-back]').first()).toBeDisabled();
  await page.locator('.nav-item[data-section="fees"]').click();
  await page.locator('[data-page-back]').last().click();
  await expect(page.locator('#students')).toHaveClass(/active-section/);
  for (const section of ['students', 'fees', 'collections', 'staff', 'expenses', 'exams', 'reports', 'settings', 'dashboard']) {
    await page.locator(`.nav-item[data-section="${section}"]`).click();
    await expect(page.locator(`#${section}`)).toHaveClass(/active-section/);
    await expect(page).toHaveURL(new RegExp(`#${section}$`));
  }
  // The settings screen shows one form at a time, behind its own tab list.
  await page.locator('.nav-item[data-section="settings"]').click();
  await expect(page.locator('[data-settings-tab]')).toHaveCount(5);
  await expect(page.locator('[data-settings-panel]:visible')).toHaveCount(1);
  await expect(page.locator('#setRegistrationFee')).toBeVisible();
  await page.locator('[data-settings-tab="departments"]').click();
  await expect(page.locator('#departmentsTable')).toBeVisible();
  await expect(page.locator('#setRegistrationFee')).toBeHidden();
  assert.equal(await page.evaluate(() => localStorage.getItem('settingsTab')), 'departments');
  await page.locator('.settings-tab.active').press('ArrowLeft');
  await expect(page.locator('#setSchoolName')).toBeVisible();
  await page.locator('.nav-item[data-section="dashboard"]').click();
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
  await page.locator('#salaryTable .btn-edit').click();
  await expect(page.locator('#salaryEditDialog')).toHaveAttribute('open', '');
  await expect(page.locator('#salaryEditIdentity')).toContainText('موظف تجريبي');
  await expect(page.locator('#salaryEditAmount')).toHaveValue('3000');
  await expect(page.locator('#salaryEditDate')).toHaveValue('2026-09-10');
  await expect(page.locator('#salaryEditPassword')).toHaveAttribute('type','password');
  await expect(page.locator('#salaryEditPassword')).toHaveValue('');
  await expect(page.locator('#salaryEditHoursWrap')).toBeHidden();
  await expect(page.locator('.input-dialog[open]')).toHaveCount(0);
  await page.locator('#salaryEditAmount').fill('3500');
  await page.locator('#salaryEditPassword').fill('secret');
  await page.locator('#salaryEditForm button.primary').click();
  await expect(page.locator('#salaryEditDialog')).not.toHaveAttribute('open','');
  assert.deepEqual(salaryRequests,[
    {path:'/api/verify-password',body:{password:'secret'}},
    {path:`/api/teacher-payments/${teacher.id}`,body:{
      month:'أكتوبر',amount:'3500',date:'2026-09-10',notes:'',hours:0,hourlyRate:0,salaryDue:5000
    }}
  ]);
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
  const feesExcelDownload=page.waitForEvent('download');
  await page.locator('#exportFees').click();
  const feesWorkbook=await feesExcelDownload;
  assert.match(feesWorkbook.suggestedFilename(),/\.xlsx$/);
  const feesWorkbookStream=await feesWorkbook.createReadStream();
  const feesWorkbookChunks=[];
  for await(const chunk of feesWorkbookStream)feesWorkbookChunks.push(chunk);
  const feesWorkbookBytes=Buffer.concat(feesWorkbookChunks);
  assert.equal(feesWorkbookBytes.subarray(0,2).toString(),'PK');
  assert.match(feesWorkbookBytes.toString(),/xl\/worksheets\/sheet1\.xml/);
  assert.match(feesWorkbookBytes.toString(),/طالب تجريبي/);
  const receiptBody=await page.evaluate(()=>{
    const originalData=state.data,originalSettings=state.settings,originalDepartments=state.departments;
    state.data=structuredClone(originalData);
    const student=state.data.students[0];
    Object.assign(student,{registrationDate:'2026-09-01',discountType:'',discountValue:0});
    state.settings={...state.settings,registrationFee:0};
    state.departments=[{id:1,name:student.className,monthlyFee:13000}];
    state.data.studentPayments=[
      {id:1,invoiceNo:'F-000001',studentId:student.id,month:'أكتوبر',amount:13000,date:'2026-09-01'},
      {id:2,invoiceNo:'F-000002',studentId:student.id,month:'نوفمبر',amount:3000,date:'2026-09-05'},
      {id:3,invoiceNo:'F-000003',studentId:student.id,month:'نوفمبر',amount:3000,date:'2026-09-10'}
    ];
    let body='';
    const originalPrintWindow=window.printWindow;
    window.printWindow=options=>{body=options.body};
    printStudentReceipt(3);
    window.printWindow=originalPrintWindow;
    state.data=originalData;state.settings=originalSettings;state.departments=originalDepartments;
    return body;
  });
  assert.match(receiptBody,/إجمالي المدفوع لهذه الرسوم[\s\S]*6,000 أوقية/);
  assert.match(receiptBody,/المتبقي لهذه الرسوم[\s\S]*7,000 أوقية/);
  assert.match(receiptBody,/إجمالي المتبقي حتى شهر نوفمبر[\s\S]*7,000 أوقية/);
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
  // The form states the school's fees and asks only what the family has paid.
  await expect(page.locator('#studentFeeRates')).toContainText('رسم التسجيل');
  await expect(page.locator('#studentFeeEntries .fee-entry')).toHaveCount(10);
  await expect(page.locator('#studentFeeEntries .fee-entry').nth(1)).toContainText('أكتوبر');
  await expect(page.locator('#studentFeeEntries .fee-entry').nth(1).getByText('دفع جزء من المبلغ')).toBeVisible();
  await expect(page.locator('#saveStudentFees')).toBeDisabled();
  // A partial amount opens its own field, and must stay under the whole fee.
  const october = page.locator('#studentFeeEntries .fee-entry').nth(1);
  await expect(october.locator('.fee-entry-amount')).toBeHidden();
  await october.getByText('دفع جزء من المبلغ').click();
  await expect(october.locator('.fee-entry-amount')).toBeVisible();
  await october.locator('[data-fee-amount]').fill('99999');
  await expect(page.locator('#studentFeeEntrySummary')).toContainText('أكبر من صفر وأقل من');
  await expect(page.locator('#saveStudentFees')).toBeDisabled();
  await october.locator('[data-fee-amount]').fill('4000');
  await expect(page.locator('#studentFeeEntrySummary')).toContainText('4,000');
  await expect(page.locator('#saveStudentFees')).toBeEnabled();
  await page.locator('#studentFeeEntries .fee-entry').nth(2).getByText('دفع المبلغ كاملا').click();
  await expect(page.locator('#studentFeeEntrySummary')).toContainText('لم تُسدَّد بعد');
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
