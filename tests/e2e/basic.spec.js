const { test, expect } = require('@playwright/test');

test('يسجل الدخول ويتنقل إلى الطلاب ثم يسجل الخروج', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#loginScreen')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'مدرسة مكارم الأخلاق الحرة' })).toBeVisible();

  await page.locator('#loginUsername').fill(process.env.E2E_USERNAME || 'yaghoub');
  await page.locator('#loginPassword').fill(process.env.E2E_PASSWORD || '36485606');
  const dataResponse = page.waitForResponse(response => response.url().endsWith('/api/data') && response.ok());
  await page.getByRole('button', { name: 'دخول' }).click();
  const data = await (await dataResponse).json();

  await expect(page.locator('#loginScreen')).toBeHidden();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#dashboard')).toHaveClass(/active-section/);
  await expect(page.locator('#sStudents')).toHaveText(data.students.length.toLocaleString('en-US'));

  await page.getByRole('button', { name: /الطلاب/ }).click();
  await expect(page.locator('#students')).toHaveClass(/active-section/);
  await expect(page.locator('#studentForm')).toBeVisible();
  await expect(page.locator('#studentName')).toBeVisible();

  await page.locator('#logoutBtn').click();
  await expect(page.locator('#loginScreen')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
});