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
  db.addTeacherPayment({ teacherId:teacher.id, month:'أكتوبر', amount:3000, date:'2026-10-31', salaryDue:5000 });
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
  const studentPaymentRequests = [];
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
    if(pathname==='/api/student-payments'&&route.request().method()==='POST'){
      studentPaymentRequests.push(route.request().postDataJSON());
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
    // The top bar takes the colour of the open section's menu button.
    await expect(page.locator('.topbar')).toHaveAttribute('data-section', section);
    await expect.poll(() => page.evaluate(s => {
      const colour = element => getComputedStyle(element).backgroundColor;
      return colour(document.querySelector('.topbar')) === colour(document.querySelector(`.nav-item[data-section="${s}"]`));
    }, section), { message: `top bar colour follows the ${section} button` }).toBe(true);
  }
  // The date in the top bar reads in Arabic with western digits.
  await expect(page.locator('#today')).toHaveText(/^(الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت)، \d{2} \S+ \d{4}$/);
  // The settings screen shows one form at a time, behind its own tab list.
  await page.locator('.nav-item[data-section="settings"]').click();
  await expect(page.locator('[data-settings-tab]')).toHaveCount(6);
  await expect(page.locator('[data-settings-panel]:visible')).toHaveCount(1);
  await expect(page.locator('#setRegistrationFee')).toBeVisible();
  await page.locator('[data-settings-tab="departments"]').click();
  await expect(page.locator('#departmentsTable')).toBeVisible();
  await expect(page.locator('#setRegistrationFee')).toBeHidden();
  assert.equal(await page.evaluate(() => localStorage.getItem('settingsTab')), 'departments');
  await page.locator('#settings .settings-tab.active').press('ArrowLeft');
  // The « طبيعة العمل » list feeds the employee form's role field.
  await expect(page.locator('#staffRolesTable')).toBeVisible();
  await expect(page.locator('#staffRolesTable tr')).toHaveCount(6);
  await expect(page.locator('#staffRolesTable')).toContainText('معلم');
  assert.deepEqual(await page.locator('#teacherRole option').allTextContents(),['أستاذ','معلم','محاسب','مراقب','عامل يدوي','أخرى']);
  await page.locator('#settings .settings-tab.active').press('ArrowLeft');
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
  // Salaries are earned on the last day of the month: the browser clock is
  // pinned to 31 October so the payroll assertions do not depend on today.
  await page.clock.setFixedTime(new Date('2026-10-31T10:00:00'));
  await page.locator('.nav-item[data-section="staff"]').click();
  // The staff page shows one screen at a time: payroll sheet first, then the
  // registry, salaries and advances behind tabs; the last opened tab is kept.
  await expect(page.locator('#payrollPanel')).toBeVisible();
  await expect(page.locator('#staffPanel-registry')).toBeHidden();
  await expect(page.locator('#staffPanel-salaries')).toBeHidden();
  await expect(page.locator('#staffPanel-advances')).toBeHidden();
  await page.locator('[data-staff-tab="registry"]').click();
  await expect(page.locator('#staffPanel-registry')).toBeVisible();
  await expect(page.locator('#payrollPanel')).toBeHidden();
  assert.equal(await page.evaluate(() => localStorage.getItem('staffTab')), 'registry');
  await page.locator('#teachersTable .btn-edit').click();
  await expect(page.locator('#teacherDialog')).toHaveAttribute('open', '');
  await expect(page.locator('#teacherName')).toHaveValue('موظف تجريبي');
  await page.keyboard.press('Escape');
  await expect(page.locator('#teacherDialog')).not.toHaveAttribute('open', '');
  await page.locator('#addTeacher').click();
  await expect(page.locator('#teacherDialog')).toHaveAttribute('open', '');
  await expect(page.locator('#teacherName')).toHaveValue('');
  await expect(page.locator('#teacherEndDateWrap')).toBeHidden();
  await page.locator('#teacherStatus').selectOption('stopped');
  await expect(page.locator('#teacherEndDateWrap')).toBeVisible();
  await page.keyboard.press('Escape');
  // The registry filters by name, role and status; active employees show by default.
  await expect(page.locator('#teacherCount')).toContainText('عدد الموظفين المعروضين: 1 من 1');
  await expect(page.locator('#teachersTable')).toContainText('أكتوبر — 2026-10-31');
  await page.locator('#teacherStatusFilter').selectOption('stopped');
  await expect(page.locator('#teachersTable')).toContainText('لا يوجد موظف مطابق للتصفية.');
  await page.locator('#teacherStatusFilter').selectOption('active');
  await page.locator('#teacherSearch').fill('تجريبي');
  await expect(page.locator('#teachersTable tr')).toHaveCount(1);
  await page.locator('#teacherSearch').fill('');
  // The monthly payroll sheet lists every employee with the state of the month
  // and pre-fills the payment form with the remaining amount.
  await page.locator('[data-staff-tab="payroll"]').click();
  // A month whose last day has not come is « لم يحل بعد »: no salary button.
  await page.locator('#payrollMonth').selectOption('نوفمبر');
  await expect(page.locator('#payrollTable tr[data-teacher-id]')).toHaveAttribute('data-payroll-status','pending');
  await expect(page.locator('#payrollTable tr[data-teacher-id] .btn-pay')).toHaveCount(0);
  await expect(page.locator('#payrollSummary')).toContainText('لم يحل موعد الاستحقاق بعد: 2026-11-30');
  await page.locator('#payrollMonth').selectOption('أكتوبر');
  const payrollRow=page.locator('#payrollTable tr[data-teacher-id]');
  await expect(payrollRow).toHaveCount(1);
  await expect(payrollRow).toHaveAttribute('data-payroll-status','partial');
  await expect(payrollRow).toContainText('2,000');
  await expect(page.locator('#payrollSummary')).toContainText('المتبقي: 2,000');
  await page.locator('#payrollPanel [data-payroll-status="paid"]').click();
  await expect(page.locator('#payrollTable tr[data-teacher-id]')).toHaveCount(0);
  await page.locator('#payrollPanel [data-payroll-status="all"]').click();
  await payrollRow.getByText('صرف المتبقي').click();
  // « صرف المتبقي » jumps to the salaries screen with the form pre-filled.
  await expect(page.locator('#staffPanel-salaries')).toBeVisible();
  await expect(page.locator('#payrollPanel')).toBeHidden();
  await expect(page.locator('#salaryMonth')).toHaveValue('أكتوبر');
  await expect(page.locator('#salaryAmount')).toHaveValue('2000');
  await page.locator('#salaryTeacherSearch').fill('غير موجود');
  await expect(page.locator('#salaryTeacher option')).toHaveCount(0);
  await page.locator('#salaryTeacherSearch').fill('');
  await expect(page.locator('#salaryTeacher option')).toHaveCount(1);
  // Salary and advance receipts print through the shared receipt window.
  const salaryReceipt=await page.evaluate(()=>{
    let body='';const original=window.printWindow;
    window.printWindow=options=>{body=options.body};
    printSalaryReceipt(state.data.teacherPayments[0].id);
    window.printWindow=original;
    return body;
  });
  assert.match(salaryReceipt,/إيصال صرف راتب/);
  assert.match(salaryReceipt,/S-000001/);
  assert.match(salaryReceipt,/موظف تجريبي/);
  assert.match(salaryReceipt,/المتبقي بعد هذه الدفعة[\s\S]*2,000 أوقية/);
  await expect(page.locator('#salaryTable')).toContainText('S-000001');
  // The salary log filters by employee, month and dates, and totals what it shows.
  await expect(page.locator('#salaryLogTotals')).toContainText('عدد الدفعات المعروضة: 1');
  await page.locator('#salaryLogMonth').selectOption('نوفمبر');
  await expect(page.locator('#salaryTable')).toContainText('لا توجد دفعات مطابقة للتصفية.');
  await page.locator('#salaryLogMonth').selectOption('');
  await page.locator('#salaryLogFrom').fill('2026-11-01');
  await expect(page.locator('#salaryLogTotals')).toContainText('عدد الدفعات المعروضة: 0');
  await page.locator('#salaryLogFrom').fill('');
  await expect(page.locator('#salaryTable tr')).toHaveCount(1);
  const salaryWorkbook=await page.evaluate(async()=>{
    const original=window.downloadXlsx;let captured=null;
    window.downloadXlsx=(name,sheet,rows)=>{captured={name,sheet,rows}};
    document.getElementById('exportSalaryLog').click();
    window.downloadXlsx=original;
    return captured;
  });
  assert.equal(salaryWorkbook.sheet,'دفعات الرواتب');
  assert.equal(salaryWorkbook.rows.length,2);
  assert.equal(salaryWorkbook.rows[1][0],'S-000001');
  await page.locator('#salaryTable .btn-edit').click();
  await expect(page.locator('#salaryEditDialog')).toHaveAttribute('open', '');
  await expect(page.locator('#salaryEditIdentity')).toContainText('موظف تجريبي');
  await expect(page.locator('#salaryEditAmount')).toHaveValue('3000');
  await expect(page.locator('#salaryEditDate')).toHaveValue('2026-10-31');
  await expect(page.locator('#salaryEditPassword')).toHaveAttribute('type','password');
  await expect(page.locator('#salaryEditPassword')).toHaveValue('');
  await expect(page.locator('#salaryEditHoursWrap')).toBeHidden();
  await expect(page.locator('.input-dialog[open]')).toHaveCount(0);
  await page.locator('#salaryEditAmount').fill('3500');
  await page.locator('#salaryEditPassword').fill('secret');
  await page.locator('#salaryEditForm button.primary').click();
  await expect(page.locator('#salaryEditDialog')).not.toHaveAttribute('open','');
  await page.clock.setSystemTime(new Date());
  assert.deepEqual(salaryRequests,[
    {path:'/api/verify-password',body:{password:'secret'}},
    {path:`/api/teacher-payments/${teacher.id}`,body:{
      month:'أكتوبر',amount:'3500',date:'2026-10-31',notes:'',hours:0,hourlyRate:0,salaryDue:5000
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
  assert.match(receiptBody,/إجمالي المدفوع لهذه الرسوم[\s\S]*0 أوقية/);
  assert.match(receiptBody,/توزيع الدفعة الفعلي[\s\S]*أكتوبر: 3,000 أوقية/);
  assert.match(receiptBody,/المتبقي لهذه الرسوم[\s\S]*13,000 أوقية/);
  assert.match(receiptBody,/إجمالي المتبقي حتى شهر نوفمبر[\s\S]*20,000 أوقية/);
  // The filters, the chips and the rows all read from the one dues vocabulary.
  await expect(page.locator('#feeStatus option')).toHaveCount(5);
  await expect(page.locator('#feeStatus option').nth(2)).toHaveText('متأخر');
  await expect(page.locator('#feeQuickFilters button').nth(2)).toContainText('متأخر');
  // The remaining modals are built from the shared dialog system.
  for (const id of ['studentExportDialog', 'teacherDialog']) {
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
  await expect(page.locator('#studentsTable .btn-pay')).toHaveText('المالية');
  await page.locator('#studentsTable .btn-pay').click();
  await expect(page.locator('#student-fees')).toHaveClass(/active-section/);
  await expect(page).toHaveURL(/#student-fees$/);
  await expect(page.locator('#studentFeesPanel')).toBeVisible();
  await expect(page.locator('#studentFeesPanel')).not.toHaveClass(/app-dialog/);
  const [paymentAmountBox,savePaymentBox,feeEntriesBox]=await Promise.all([
    page.locator('#studentFeePaymentAmount').boundingBox(),
    page.locator('#saveStudentFees').boundingBox(),
    page.locator('#studentFeeEntries').boundingBox()
  ]);
  assert.ok(savePaymentBox.y>paymentAmountBox.y+paymentAmountBox.height,'save follows the amount field');
  assert.ok(savePaymentBox.y+savePaymentBox.height<feeEntriesBox.y,'save stays above the payment status rows');
  const paymentDate=page.locator('.fee-entry-date .dmy-group');
  await expect(paymentDate.getByText('اليوم',{exact:true})).toBeVisible();
  await expect(paymentDate.getByText('الشهر',{exact:true})).toBeVisible();
  await expect(paymentDate.getByText('السنة',{exact:true})).toBeVisible();
  await paymentDate.locator('.dmy-year').fill('2024');
  await paymentDate.locator('.dmy-month').selectOption('2');
  await expect(paymentDate.locator('.dmy-day option')).toHaveCount(30);
  await paymentDate.locator('.dmy-day').selectOption('29');
  assert.equal(await page.locator('#studentFeeEntryDate').inputValue(),'2024-02-29');
  await paymentDate.locator('.dmy-year').fill('2025');
  await expect(paymentDate.locator('.dmy-day option')).toHaveCount(29);
  await expect(paymentDate.locator('.dmy-day')).toHaveValue('');
  await expect(paymentDate.locator('.dmy-error')).toContainText('28 يومًا فقط');
  assert.equal(await page.locator('#studentFeeEntryDate').inputValue(),'');
  await paymentDate.locator('.dmy-month').selectOption('4');
  await expect(paymentDate.locator('.dmy-day option')).toHaveCount(31);
  await paymentDate.locator('.dmy-month').selectOption('3');
  await expect(paymentDate.locator('.dmy-day option')).toHaveCount(32);
  await page.locator('#resetStudentFees').click();
  assert.notEqual(await page.locator('#studentFeeEntryDate').inputValue(),'');
  // The form states the school's fees and asks only what the family has paid.
  await expect(page.locator('#studentFeeRates')).toContainText('رسم التسجيل');
  await expect(page.locator('#studentFeeEntries .fee-entry')).toHaveCount(10);
  const october = page.locator('#studentFeeEntries .fee-entry').filter({hasText:'أكتوبر'});
  await expect(october).toContainText('أكتوبر');
  await expect(october).toContainText('لم يُسدَّد');
  await expect(page.locator('#saveStudentFees')).toBeDisabled();
  // One amount is distributed over registration, compulsory June, then October.
  await page.locator('#studentFeePaymentAmount').fill('999999');
  await expect(page.locator('#studentFeeEntrySummary')).toContainText('يتجاوز إجمالي المتبقي');
  await expect(page.locator('#saveStudentFees')).toBeDisabled();
  await page.locator('#studentFeePaymentAmount').fill('13200');
  await expect(page.locator('#studentFeeEntrySummary')).toContainText('رسوم التسجيل: 200');
  await expect(page.locator('#studentFeeEntrySummary')).toContainText('يونيو: 12,000');
  await expect(page.locator('#studentFeeEntrySummary')).toContainText('أكتوبر: 1,000');
  await expect(page.locator('#studentFeeEntries .fee-entry').filter({hasText:'يونيو'})).toContainText('مسدَّد بالكامل');
  await expect(october).toContainText('مسدَّد جزئياً');
  await expect(october).toContainText('المتبقي بعدها: 11,000');
  await expect(page.locator('#saveStudentFees')).toBeEnabled();
  await page.locator('#saveStudentFees').click();
  await expect.poll(()=>studentPaymentRequests.length).toBe(1);
  assert.equal(studentPaymentRequests[0].amount,13200);
  assert.equal(studentPaymentRequests[0].month,'رسوم التسجيل');
  await expect(page.locator('#studentFeePaymentAmount')).toHaveValue('');
  await expect(page.locator('#saveStudentFees')).toBeDisabled();
  // Each charge exposes its amounts and the invoices allocated to it without
  // leaving the unified fee form.
  await page.evaluate(()=>{
    const student=state.data.students[0];
    state.data.studentPayments=[{id:91,invoiceNo:'F-000091',studentId:student.id,month:REGISTRATION,amount:200,date:'2026-09-11'}];
    ledgerCache=null;
    refreshStudentFeeDetails();
  });
  await expect(page.locator('#studentFeeEntries [data-charge-details]')).toHaveCount(10);
  // The paid-status list filters by period and payment state like the invoice table.
  const entryFilters=page.locator('#studentFeeEntryFilters');
  const visibleEntries=page.locator('#studentFeeEntries .fee-entry:visible');
  // Periods follow the school-year timeline: June (payable at enrolment) still lies ahead.
  await expect(page.locator('#studentFeeEntries .fee-entry').filter({hasText:'يونيو'})).toHaveAttribute('data-fee-period','future');
  await expect(entryFilters.locator('[data-fee-period="all"]')).toHaveAttribute('aria-pressed','true');
  await expect(entryFilters.locator('[data-fee-status="all"]')).toHaveAttribute('aria-pressed','true');
  await entryFilters.locator('[data-fee-status="paid"]').click();
  await expect(visibleEntries).toHaveCount(1);
  await expect(visibleEntries).toContainText('رسوم التسجيل');
  await expect(page.locator('#studentFeeEntryFilterCount')).toContainText('عرض 1 من 10 رسم');
  await entryFilters.locator('[data-fee-status="unpaid"]').click();
  await expect(visibleEntries).toHaveCount(9);
  await entryFilters.locator('[data-fee-status="all"]').click();
  await entryFilters.locator('[data-fee-period="current"]').click();
  assert.deepEqual(await visibleEntries.evaluateAll(rows=>[...new Set(rows.map(row=>row.dataset.feePeriod))]),['current']);
  await entryFilters.locator('[data-fee-period="future"]').click();
  await entryFilters.locator('[data-fee-status="paid"]').click();
  await expect(visibleEntries).toHaveCount(0);
  await expect(page.locator('#studentFeeEntryFilterEmpty')).toBeVisible();
  await entryFilters.locator('[data-fee-period="all"]').click();
  await entryFilters.locator('[data-fee-status="all"]').click();
  await expect(visibleEntries).toHaveCount(10);
  await expect(page.locator('#studentFeeEntryFilterEmpty')).toBeHidden();
  await page.locator('#studentFeeEntries .fee-entry').first().locator('[data-charge-details]').click();
  await expect(page.locator('#studentChargeDetailsDialog')).toHaveAttribute('open','');
  await expect(page.locator('#studentChargeDetailsTitle')).toContainText('التسجيل');
  await expect(page.locator('#studentChargeDetailsBody')).toContainText('F-000091');
  await expect(page.locator('#studentChargeDetailsBody')).toContainText('المخصَّص لهذا الرسم');
  await page.locator('#studentChargeDetailsDialog [data-close-dialog]').last().click();
  await expect(page.locator('#studentChargeDetailsDialog')).not.toHaveAttribute('open','');
  await page.locator('#studentAccountDetails summary').click();
  await expect(page.locator('#studentLedger')).toBeVisible();
  await expect(page.locator('#studentLedgerTitle')).toHaveText('الفواتير');
  // One row per invoice; the note lists the fees the receipt settled.
  await expect(page.locator('#studentLedgerRows tr[data-payment-id]')).toHaveCount(1);
  await expect(page.locator('#studentLedgerRows tr[data-payment-id="91"]')).toContainText('رسوم التسجيل: 200');
  await page.evaluate(()=>{
    const student=state.data.students[0];
    state.data.studentPayments.push({id:92,invoiceNo:'F-000092',studentId:student.id,month:'يونيو',amount:1000,date:'2026-09-11',time:'14:05'});
    ledgerCache=null;
    refreshStudentFeeDetails();
  });
  await expect(page.locator('#studentLedgerRows tr[data-payment-id]')).toHaveCount(2);
  const juneInvoice=page.locator('#studentLedgerRows tr[data-payment-id="92"]');
  await expect(juneInvoice).toContainText('2026-09-11 14:05');
  await expect(juneInvoice).toContainText('يونيو: 1,000');
  await expect(juneInvoice).toContainText('F-000092');
  await expect(juneInvoice.getByText('طباعة')).toBeVisible();
  await expect(juneInvoice.getByText('تعديل')).toBeVisible();
  await expect(juneInvoice.getByText('حذف')).toBeVisible();
  await expect(page.locator('#studentLedgerPayments')).toHaveCount(0);
  await expect(page.locator('#studentLedger .ledger-period-filters')).toHaveCount(0);
  await expect(page.locator('#student-fees')).toHaveClass(/active-section/);
  await page.locator('#closeStudentFees').click();
  await expect(page.locator('#students')).toHaveClass(/active-section/);
  await page.locator('.nav-item[data-section="fees"]').click();
  await page.locator('#feesTable .fee-row-actions .btn-edit').first().click();
  await expect(page.locator('#student-fees')).toHaveClass(/active-section/);
  await expect(page.locator('#studentAccountDetails')).toHaveAttribute('open','');
  await page.locator('#closeStudentFees').click();
  await expect(page.locator('#fees')).toHaveClass(/active-section/);
  await page.locator('#feesTable .fee-row-actions button').first().click();
  await expect(page.locator('#student-fees')).toHaveClass(/active-section/);
  await page.evaluate(() => sessionStorage.setItem('modeSwitchToken', 'replacement-token'));
  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('modeSwitchToken')), null);
  await page.locator('#logoutBtn').click();
  await expect(page.locator('#loginScreen')).toBeVisible();
  assert.deepEqual(errors, []);
});
