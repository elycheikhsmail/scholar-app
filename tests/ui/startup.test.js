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
  db.addStudent({ name: 'طالب تجريبي', schoolNo: 'UI1', nni: '1234567890', className: '6AF', gender: 'ذكر', guardianName: 'ولي الأمر', guardianPhone: '22334455' });
  const teacher=db.addTeacher({ name: 'موظف تجريبي', role: 'معلم', fixedSalary: 5000, phone: '33445566' });
  db.addTeacherPayment({ teacherId:teacher.id, month:'أكتوبر', amount:3000, date:'2026-10-31', salaryDue:5000 });
  const settings = { ...db.publicSettings(), applicationMode: 'production', version:require('../../package.json').version };
  const responses = {
    '/api/mode': { mode: 'production' },
    '/api/settings': settings,
    '/api/login': { token: 'ui-test-token', settings, user: { id: 1, username: 'yaghoub', role: 'admin' } },
    '/api/logout': { ok: true },
    '/api/data': db.getCoreData(),
    '/api/users': [{ id: 1, username: 'yaghoub', role: 'admin' }, { id: 3, username: 'sami', role: 'secretary' }],
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
  const databaseRequests = [];
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
    if(pathname==='/api/database/export'){
      databaseRequests.push({path:pathname,body:route.request().postDataJSON()});
      return route.fulfill({status:200,headers:{'Content-Disposition':'attachment; filename="school-data-2026-09-12.sqlite"'},contentType:'application/vnd.sqlite3',body:Buffer.from('SQLite format 3\0mock')});
    }
    if(pathname==='/api/database/import'){
      databaseRequests.push({path:pathname,password:route.request().headers()['x-confirm-password'],size:route.request().postDataBuffer().length});
      return route.fulfill({json:{ok:true,backup:'x',counts:{students:12,departments:18}}});
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
  // The mocked API keeps no session cookie: every reload lands on the login form.
  const login=async()=>{
    await page.locator('#loginUsername').fill('test');
    await page.locator('#loginPassword').fill('test');
    await page.locator('#loginForm button').click();
    await expect(page.locator('#app')).toBeVisible();
  };
  await login();
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
  await expect(page.locator('[data-settings-tab]')).toHaveCount(10);
  await expect(page.locator('[data-settings-tab]:visible')).toHaveCount(9, 'the database tab is for the developer');
  await expect(page.locator('[data-settings-panel]:visible')).toHaveCount(1);
  await expect(page.locator('#currentUser')).toHaveText('yaghoub · مدير النظام');
  // Admins manage the accounts; their own row has no delete button.
  await page.locator('[data-settings-tab="users"]').click();
  await expect(page.locator('#usersTable tr')).toHaveCount(2);
  await expect(page.locator('#usersTable .btn-delete')).toHaveCount(1);
  await expect(page.locator('#usersTable .role-select')).toHaveCount(1);
  await page.locator('[data-settings-tab="fees"]').click();
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
  // A test date (mode tab) makes the app behave as on that day on this device:
  // top-bar warning, current month, default form dates; clearing it restores today.
  await page.locator('[data-settings-tab="mode"]').click();
  await expect(page.locator('#simulatedDateInfo')).toContainText('التاريخ الحقيقي');
  await expect(page.locator('#clearSimulatedDate')).toBeHidden();
  await page.locator('#simulatedDate').fill('2026-12-15');
  await page.locator('#simulatedDateForm button.primary').click();
  await login();
  await expect(page.locator('#today')).toHaveText('⚠️ تاريخ تجريبي: الثلاثاء، 15 ديسمبر 2026');
  await expect(page.locator('#feeMonth')).toHaveValue('ديسمبر');
  await expect(page.locator('#salaryDate')).toHaveValue('2026-12-15');
  // The expenses register filters by school month (all months by default).
  await page.locator('.nav-item[data-section="expenses"]').click();
  // Invalid entries are flagged on their own fields before anything is sent.
  await page.locator('#expenseAmount').fill('0');
  await page.locator('#expenseForm button.primary').click();
  await expect(page.locator('#expenseForm .field-invalid')).toHaveCount(2);
  await expect(page.locator('#expenseForm .field-error').first()).toHaveText('نوع المصروف مطلوب.');
  await expect(page.locator('#expenseAmount').locator('xpath=..')).toContainText('أكبر من صفر');
  await expect(page.locator('#expenseCategory')).toBeFocused();
  await page.locator('#expenseCategory').fill('إيجار');
  await expect(page.locator('#expenseForm .field-invalid')).toHaveCount(1);
  await page.locator('#cancelExpense').click();
  await expect(page.locator('#expenseForm .field-invalid')).toHaveCount(0);
  assert.deepEqual(await page.locator('#expenseMonth option').allTextContents(), ['كل الأشهر', 'أكتوبر', 'نوفمبر', 'ديسمبر']);
  await expect(page.locator('#expenseMonth')).toHaveValue('__all__');
  await expect(page.locator('#expenseCount')).toHaveText('0');
  await page.locator('#expenseMonth').selectOption('نوفمبر');
  await expect(page.locator('#expensesTable')).toContainText('لا توجد مصروفات في شهر نوفمبر.');
  // Reports are monthly: any month already begun can be chosen, the current one
  // by default; income and outgoings follow the dates of the receipts.
  await page.locator('.nav-item[data-section="reports"]').click();
  assert.deepEqual(await page.locator('#reportMonth option').allTextContents(), ['أكتوبر', 'نوفمبر', 'ديسمبر', 'السنة الدراسية كاملة']);
  await expect(page.locator('#reportMonth')).toHaveValue('ديسمبر');
  await expect(page.locator('#rOut')).toHaveText('0');
  await page.locator('#reportMonth').selectOption('أكتوبر');
  await expect(page.locator('#rOut')).toHaveText('3\u00a0000');
  await expect(page.locator('#rOutSalaries')).toHaveText('3\u00a0000');
  await expect(page.locator('#rOutExpenses')).toHaveText('0');
  await expect(page.locator('#rSalaries')).toHaveText('3\u00a0000');
  await expect(page.locator('#reportPeriodInfo')).toContainText('إلى 2026-10-31');
  await expect(page.locator('#departmentDuesInfo')).toContainText('2026-10-31');
  // The print button reproduces the displayed period in the shared A4 window.
  const printedReport=await page.evaluate(()=>{
    let printed={};const original=window.printWindow;
    window.printWindow=options=>{printed=options};
    document.getElementById('printReport').click();
    window.printWindow=original;
    return printed;
  });
  assert.equal(printedReport.title,'التقرير المالي — شهر أكتوبر');
  assert.match(printedReport.body,/الرواتب المدفوعة<\/td><td>3\u00a0000/);
  assert.match(printedReport.body,/الخارج: الرواتب والسلف<\/td><td>3\u00a0000/);
  assert.match(printedReport.body,/الخارج: المصروفات<\/td><td>0/);
  assert.match(printedReport.body,/إجمالي الخارج<\/td><td>3\u00a0000/);
  assert.match(printedReport.body,/ملخص المستحقات حسب القسم/);
  await page.locator('#reportMonth').selectOption('__year__');
  await expect(page.locator('#rOut')).toHaveText('3\u00a0000');
  await expect(page.locator('#reportPeriodInfo')).toContainText('إلى 2026-12-15');
  await page.locator('.nav-item[data-section="settings"]').click();
  await expect(page.locator('#simulatedDateInfo')).toContainText('الشهر الجاري المعتمد: ديسمبر');
  await page.locator('#clearSimulatedDate').click();
  await login();
  await expect(page.locator('#today')).not.toContainText('تاريخ تجريبي');
  assert.equal(await page.evaluate(() => localStorage.getItem('simulatedDate')), null);
  // A test database prepared by scripts/seed-testing.js proposes its own date:
  // adopted once on this device, still clearable, and not proposed again.
  responses['/api/mode'] = { mode: 'test', testDate: '2027-02-28', testDateIssued: '2026-09-11T00:00:00.000Z' };
  await page.reload();
  await expect(page.locator('#loginModeBadge')).toHaveText('نسخة للتجريب فقط');
  await login();
  await expect(page.locator('#today')).toHaveText('⚠️ تاريخ تجريبي: الأحد، 28 فبراير 2027');
  await expect(page.locator('#feeMonth')).toHaveValue('فبراير');
  await page.locator('.nav-item[data-section="settings"]').click();
  await page.locator('[data-settings-tab="mode"]').click();
  await page.locator('#clearSimulatedDate').click();
  await login();
  await expect(page.locator('#today')).not.toContainText('تاريخ تجريبي');
  // The read-only web copy: same screens, badge, every writing control hidden,
  // and no write ever leaves the browser.
  responses['/api/mode'] = { mode: 'production', readOnly: true };
  await page.reload();
  await expect(page.locator('#loginModeBadge')).toHaveText('نسخة للعرض فقط');
  await login();
  await expect(page.locator('body')).toHaveClass(/read-only/);
  await page.locator('.nav-item[data-section="students"]').click();
  await expect(page.locator('#studentsTable')).toContainText('طالب تجريبي');
  await expect(page.locator('.student-form-panel')).toBeHidden();
  await expect(page.locator('#studentsTable .btn-delete').first()).toBeHidden();
  await expect(page.locator('#studentsTable [onclick^="editStudent"]').first()).toBeHidden();
  await expect(page.locator('#studentsTable .btn-pay').first()).toBeVisible();
  await page.locator('.nav-item[data-section="staff"]').click();
  await expect(page.locator('#addTeacher')).toBeHidden();
  await page.locator('.nav-item[data-section="expenses"]').click();
  await expect(page.locator('#expenseForm')).toBeHidden();
  await page.locator('.nav-item[data-section="settings"]').click();
  await expect(page.locator('[data-settings-tab="sync"]')).toBeHidden();
  await expect(page.locator('[data-settings-tab="data"]')).toBeHidden();
  const refused = await page.evaluate(() => api('/expenses', { method: 'POST', body: '{}' }).then(() => 'sent', error => error.message));
  assert.equal(refused, 'هذه النسخة للعرض فقط؛ لا يمكن الحفظ أو التعديل.');
  assert.equal(errors.filter(e => /\/api\/expenses/.test(e)).length, 0, 'no write request was issued');
  responses['/api/mode'] = { mode: 'production' };
  // A supervisor reads everything and changes nothing; a secretary records
  // without reaching the settings; both keep « حسابي ». A remembered tab the
  // role cannot see is not restored.
  responses['/api/login'] = { token: 'ui-test-token', settings, user: { id: 5, username: 'nadia', role: 'supervisor' } };
  await page.reload();
  await login();
  await expect(page.locator('body')).toHaveClass(/no-write/);
  await expect(page.locator('#currentUser')).toHaveText('nadia · مشرف');
  await page.locator('.nav-item[data-section="expenses"]').click();
  await expect(page.locator('#expenseForm')).toBeHidden();
  await page.locator('.nav-item[data-section="settings"]').click();
  await expect(page.locator('[data-settings-tab]:visible')).toHaveCount(1);
  await expect(page.locator('#settingsPanel-account')).toBeVisible();
  await expect(page.locator('#accountUsername')).toHaveText('nadia');
  responses['/api/login'] = { token: 'ui-test-token', settings, user: { id: 3, username: 'sami', role: 'secretary' } };
  await page.reload();
  await login();
  await expect(page.locator('body')).not.toHaveClass(/no-write/);
  await page.locator('.nav-item[data-section="expenses"]').click();
  await expect(page.locator('#expenseForm')).toBeVisible();
  await page.locator('.nav-item[data-section="settings"]').click();
  await expect(page.locator('[data-settings-tab]:visible')).toHaveCount(1);
  responses['/api/login'] = { token: 'ui-test-token', settings, user: { id: 2, username: 'developer', role: 'developer' } };
  await page.reload();
  await login();
  await page.locator('.nav-item[data-section="settings"]').click();
  await expect(page.locator('[data-settings-tab]:visible')).toHaveCount(10);
  await expect(page.locator('[data-settings-tab="database"]')).toBeVisible();
  // Export: the developer's password travels with the request, the file downloads.
  await page.locator('[data-settings-tab="database"]').click();
  await page.locator('#exportDatabaseBtn').click();
  await page.locator('.input-dialog[open] input').fill('Dev@2026');
  const databaseDownload=page.waitForEvent('download');
  await page.locator('.input-dialog[open] button.primary').click();
  assert.equal((await databaseDownload).suggestedFilename(),'school-data-2026-09-12.sqlite');
  assert.deepEqual(databaseRequests.pop(),{path:'/api/database/export',body:{password:'Dev@2026'}});
  // Import: file, password, explicit confirmation, then back to the login screen.
  await page.locator('#importDatabaseBtn').click();
  await page.locator('#importDatabaseFile').setInputFiles({name:'school-data.sqlite',mimeType:'application/vnd.sqlite3',buffer:Buffer.from('SQLite format 3\0abc')});
  await page.locator('.input-dialog[open] input').fill('Dev@2026');
  await page.locator('.input-dialog[open] button.primary').click();
  await expect(page.locator('.input-dialog[open]')).toContainText('استبدال قاعدة البيانات');
  await page.locator('.input-dialog[open] button.primary').click();
  await expect(page.locator('#toast')).toContainText('12 طالبًا');
  assert.deepEqual(databaseRequests.pop(),{path:'/api/database/import',password:'Dev%402026',size:19});
  await expect(page.locator('#loginScreen')).toBeVisible({timeout:10000});
  responses['/api/login'] = { token: 'ui-test-token', settings, user: { id: 1, username: 'yaghoub', role: 'admin' } };
  await page.reload();
  await login();
  await expect(page.locator('body')).not.toHaveClass(/read-only/);
  // The sync tab shows the state of the web copy and sends the snapshot on demand.
  await page.locator('.nav-item[data-section="settings"]').click();
  await page.locator('[data-settings-tab="sync"]').click();
  await expect(page.locator('#syncLastAt')).toHaveText('لم تتم بعد');
  await expect(page.locator('#syncPending')).toHaveText('3'); // the three records seeded above
  await expect(page.locator('#syncNow')).toBeDisabled();
  await expect(page.locator('#syncTokenInfo')).toContainText('لم يُحفظ');
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
  // Invalid entries are flagged on their own fields before anything is sent.
  await page.locator('#teacherPhone').fill('123');
  await page.locator('#teacherEndDate').fill('');
  await page.locator('#teacherForm button.primary').click();
  await expect(page.locator('#teacherForm .field-invalid')).toHaveCount(3);
  await expect(page.locator('#teacherForm .field-error').first()).toHaveText('اسم الموظف مطلوب.');
  await expect(page.locator('#teacherPhone').locator('xpath=..')).toContainText('8 أرقام');
  await expect(page.locator('#teacherEndDateWrap')).toContainText('نهاية الخدمة');
  await expect(page.locator('#teacherName')).toBeFocused();
  await page.locator('#teacherName').fill('موظف جديد');
  await expect(page.locator('#teacherForm .field-invalid')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('#teacherForm .field-invalid')).toHaveCount(0);
  // The registry filters by name, role and status; active employees show by default.
  await expect(page.locator('#teacherCount')).toContainText('عدد الموظفين المعروضين: 1 من 1');
  await expect(page.locator('#teachersTable')).toContainText('أكتوبر — 2026-10-31');
  await page.locator('#teacherStatusFilter').selectOption('stopped');
  await expect(page.locator('#teachersTable')).toContainText('لا يوجد موظف مطابق للتصفية.');
  await page.locator('#teacherStatusFilter').selectOption('active');
  await page.locator('#teacherSearch').fill('تجريبي');
  await expect(page.locator('#teachersTable tr')).toHaveCount(1);
  // A phone number (even in Arabic digits) finds the employee.
  await page.locator('#teacherSearch').fill('٣٣٤٤٥٥');
  await expect(page.locator('#teachersTable tr')).toHaveCount(1);
  await expect(page.locator('#teachersTable')).toContainText('موظف تجريبي');
  await page.locator('#teacherSearch').fill('99999999');
  await expect(page.locator('#teachersTable')).toContainText('لا يوجد موظف مطابق للتصفية.');
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
  // The sheet searches by phone (Arabic digits accepted) as well as by name.
  await page.locator('#payrollSearch').fill('٣٣٤٤٥٥');
  await expect(payrollRow).toHaveCount(1);
  await page.locator('#payrollSearch').fill('99999999');
  await expect(page.locator('#payrollTable')).toContainText('لا يوجد موظف مطابق للبحث «99999999»');
  await page.locator('#payrollSearch').fill('');
  await expect(payrollRow).toHaveCount(1);
  await expect(payrollRow).toHaveAttribute('data-payroll-status','partial');
  await expect(payrollRow).toContainText('33445566');
  await expect(payrollRow).toContainText('2\u00a0000');
  await expect(page.locator('#payrollSummary')).toContainText('المتبقي: 2\u00a0000');
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
  // A search with no match says so and the form refuses with a readable message.
  await expect(page.locator('#salaryDueInfo')).toContainText('لا يوجد موظف مطابق للبحث «غير موجود»');
  await page.locator('#salaryForm button.primary').click();
  await expect(page.locator('#toast')).toContainText('لا يوجد موظف مطابق للبحث');
  await expect(page.locator('#salaryTeacherSearch')).toBeFocused();
  await page.locator('#salaryTeacherSearch').fill('33445566');
  await expect(page.locator('#salaryTeacher option')).toHaveCount(1);
  await page.locator('#salaryTeacherSearch').fill('');
  await expect(page.locator('#salaryTeacher option')).toHaveCount(1);
  // The advance form searches the same way, by name or phone.
  await page.locator('[data-staff-tab="advances"]').click();
  await page.locator('#advanceTeacherSearch').fill('٣٣٤٤٥٥٦٦');
  await expect(page.locator('#advanceTeacher option')).toHaveCount(1);
  await page.locator('#advanceTeacherSearch').fill('غير موجود');
  await expect(page.locator('#advanceTeacher option')).toHaveCount(0);
  await expect(page.locator('#advanceDueInfo')).toContainText('لا يوجد موظف مطابق للبحث «غير موجود»');
  await page.locator('#advanceTeacherSearch').fill('');
  await expect(page.locator('#advanceTeacher option')).toHaveCount(1);
  await page.locator('[data-staff-tab="salaries"]').click();
  // Salary and advance receipts print through the shared receipt window.
  const salaryReceipt=await page.evaluate(()=>{
    let body='';const original=window.printWindow;
    window.printWindow=options=>{body=options.body};
    printSalaryReceipt(state.data.teacherPayments[0].id);
    window.printWindow=original;
    return body;
  });
  assert.match(salaryReceipt,/إيصال صرف راتب/);
  // Receipts never carry the test-copy label, whatever the mode.
  assert.doesNotMatch(salaryReceipt,/نسخة للتجريب فقط/);
  assert.match(salaryReceipt,/S-000001/);
  assert.match(salaryReceipt,/موظف تجريبي/);
  assert.match(salaryReceipt,/المتبقي بعد هذه الدفعة[\s\S]*2\u00a0000 أوقية/);
  await expect(page.locator('#salaryTable')).toContainText('S-000001');
  await expect(page.locator('#salaryTable')).toContainText('33445566');
  // The salary log filters by employee, month and dates, and totals what it shows.
  await expect(page.locator('#salaryLogTotals')).toContainText('عدد الدفعات المعروضة: 1');
  await page.locator('#salaryLogMonth').selectOption('نوفمبر');
  await expect(page.locator('#salaryTable')).toContainText('لا توجد دفعات مطابقة للتصفية.');
  await page.locator('#salaryLogMonth').selectOption('');
  await page.locator('#salaryLogFrom').fill('2026-11-01');
  await expect(page.locator('#salaryLogTotals')).toContainText('عدد الدفعات المعروضة: 0');
  await page.locator('#salaryLogFrom').fill('');
  await expect(page.locator('#salaryTable tr')).toHaveCount(1);
  // Staff exports share one column-picker dialog; the choice is kept per table.
  await page.locator('#exportSalaryLog').click();
  await expect(page.locator('#columnExportDialog')).toHaveAttribute('open', '');
  await expect(page.locator('#columnExportTitle')).toContainText('سجل دفعات الرواتب');
  await expect(page.locator('#columnExportCount')).toContainText('سيتم تصدير 1 دفعة');
  await page.locator('#clearColumnExport').click();
  await page.locator('[data-export-column="receiptNo"]').check();
  await page.locator('[data-export-column="name"]').check();
  await page.evaluate(()=>{window.__xlsxOriginal=window.downloadXlsx;window.downloadXlsx=(name,sheet,rows)=>{window.__xlsxCaptured={name,sheet,rows}}});
  await page.locator('#columnExportForm button.primary').click();
  await expect(page.locator('#columnExportDialog')).not.toHaveAttribute('open', '');
  const salaryWorkbook=await page.evaluate(()=>{window.downloadXlsx=window.__xlsxOriginal;return window.__xlsxCaptured});
  assert.equal(salaryWorkbook.sheet,'دفعات الرواتب');
  assert.deepEqual(salaryWorkbook.rows,[['رقم الإيصال','الموظف'],['S-000001','موظف تجريبي']]);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('salaryExportColumns'))),['receiptNo','name']);
  // The payroll sheet and the staff register get the same dialog.
  await page.locator('[data-staff-tab="payroll"]').click();
  await page.locator('#exportPayroll').click();
  await expect(page.locator('#columnExportTitle')).toContainText('كشف رواتب الشهر');
  await expect(page.locator('[data-export-column="status"]')).toBeChecked();
  await page.locator('#closeColumnExport').click();
  await page.locator('[data-staff-tab="registry"]').click();
  await page.locator('#exportTeachers').click();
  await expect(page.locator('#columnExportTitle')).toContainText('سجل الموظفين');
  await expect(page.locator('#columnExportCount')).toContainText('سيتم تصدير 1 موظف');
  await page.locator('#closeColumnExport').click();
  await page.locator('[data-staff-tab="salaries"]').click();
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
  // The guardian's phone finds the pupils of that family.
  await page.locator('#feeSearch').fill('٢٢٣٣٤٤٥٥');
  await expect(page.locator('#feesTable')).toContainText('طالب تجريبي');
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
  assert.doesNotMatch(receiptBody,/نسخة للتجريب فقط/);
  assert.match(receiptBody,/توزيع الدفعة الفعلي[\s\S]*أكتوبر: 3\u00a0000 أوقية/);
  assert.match(receiptBody,/المتبقي لهذه الرسوم[\s\S]*13\u00a0000 أوقية/);
  assert.match(receiptBody,/إجمالي المتبقي حتى شهر نوفمبر[\s\S]*20\u00a0000 أوقية/);
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
  // The guardian's phone or name finds the pupils of that family.
  await page.locator('#studentSearch').fill('22334455');
  await expect(page.locator('#studentsTable')).toContainText('طالب تجريبي');
  await page.locator('#studentSearch').fill('99999999');
  await expect(page.locator('#studentsTable .btn-edit')).toHaveCount(0);
  await page.locator('#studentSearch').fill('ولي الأمر');
  await expect(page.locator('#studentsTable .btn-edit')).toHaveCount(1);
  await page.locator('#studentSearch').fill('');
  // The gender filter narrows the register and combines with the search.
  await page.locator('#studentGenderFilter').selectOption('أنثى');
  await expect(page.locator('#studentsTable .btn-edit')).toHaveCount(0);
  await expect(page.locator('#studentCount')).toHaveText('عدد الطلاب: 0');
  await page.locator('#studentGenderFilter').selectOption('ذكر');
  await expect(page.locator('#studentsTable .btn-edit')).toHaveCount(1);
  await page.locator('#studentGenderFilter').selectOption('');
  // Invalid entries are flagged on their own fields (red border, message below,
  // focus on the first) before anything is sent; correcting a field clears it.
  await page.locator('#nni').fill('123');
  await page.locator('#studentForm button.primary').click();
  await expect(page.locator('#studentForm .field-invalid')).toHaveCount(5);
  await expect(page.locator('#studentForm .field-error').first()).toHaveText('اختر القسم.');
  await expect(page.locator('#nni').locator('xpath=..')).toContainText('10 أرقام بالضبط');
  await expect(page.locator('#className')).toBeFocused();
  await page.locator('#nni').fill('1234567890');
  await expect(page.locator('#nni').locator('xpath=..')).not.toHaveClass(/field-invalid/);
  await expect(page.locator('#studentForm .field-invalid')).toHaveCount(4);
  await page.locator('#cancelStudent').click();
  await expect(page.locator('#studentForm .field-invalid')).toHaveCount(0);
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
  await expect(page.locator('#studentFeeEntrySummary')).toContainText('يونيو: 12\u00a0000');
  await expect(page.locator('#studentFeeEntrySummary')).toContainText('أكتوبر: 1\u00a0000');
  await expect(page.locator('#studentFeeEntries .fee-entry').filter({hasText:'يونيو'})).toContainText('مسدَّد بالكامل');
  await expect(october).toContainText('مسدَّد جزئياً');
  await expect(october).toContainText('المتبقي بعدها: 11\u00a0000');
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
  await expect(juneInvoice).toContainText('يونيو: 1\u00a0000');
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
