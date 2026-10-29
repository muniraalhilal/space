import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'space-demo-2026';

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByPlaceholder('you@company.com').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await page.waitForURL(/\/o\/[0-9a-f-]{36}/, { timeout: 60_000 });
  return page.url().match(/\/o\/([0-9a-f-]{36})/)![1];
}

test('sign in, see the office with live presence and today’s panels', async ({ page }) => {
  const orgId = await signIn(page, 'munira@juniper.demo');
  await page.goto(`/o/${orgId}?still=1`);
  await expect(page.getByText('Team Presence')).toBeVisible();
  await expect(page.getByText('In office', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /Today at Juniper Space/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent Activity' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Upcoming' })).toBeVisible();
  await expect(page.locator('[data-office] canvas')).toBeVisible();
});

test('the 2D map is an accessible alternative to the 3D office', async ({ page }) => {
  const orgId = await signIn(page, 'sara@juniper.demo');
  await page.goto(`/o/${orgId}?still=1`);
  await page.getByRole('button', { name: 'Switch to 2D map' }).click();
  await expect(page.locator('[data-office] canvas')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Development/ }).first()).toBeVisible();
});

test('an employee creates a task in their department', async ({ page }) => {
  const orgId = await signIn(page, 'sara@juniper.demo');
  await page.goto(`/o/${orgId}/tasks`);
  await page.getByRole('button', { name: /New task/ }).first().click();
  const title = `E2E task ${Date.now()}`;
  await page.getByRole('dialog').locator('input').first().fill(title);
  await page.getByRole('dialog').getByRole('button', { name: /Create task/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Unassigned tasks appear under "All" (not "Assigned to me").
  await page.getByRole('tab', { name: 'All' }).click();
  await expect(page.getByText(title).first()).toBeVisible();
});

test('a viewer cannot reach company settings', async ({ page }) => {
  const orgId = await signIn(page, 'sultan@juniper.demo');
  await page.goto(`/o/${orgId}/settings?tab=audit`);
  await expect(page.getByText('Company admins only')).toBeVisible();
});

test('company admins see members, roles and the audit log', async ({ page }) => {
  const orgId = await signIn(page, 'munira@juniper.demo');
  await page.goto(`/o/${orgId}/settings?tab=members`);
  await expect(page.getByRole('heading', { name: 'What each role can do' })).toBeVisible();
  // A settings change shows up in the audit log.
  await page.getByRole('tab', { name: /Company/ }).click();
  const accent = page.locator('input.font-mono').nth(1);
  const current = await accent.inputValue();
  await accent.fill(current.toLowerCase() === '#f3c48b' ? '#f2c48b' : '#f3c48b');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Company updated')).toBeVisible();
  await page.getByRole('tab', { name: /Audit log/ }).click();
  await expect(page.getByText('org.update').first()).toBeVisible();
});

test('presence changes reach other people live (no reload)', async ({ page, browser }) => {
  const orgId = await signIn(page, 'munira@juniper.demo');
  await page.goto(`/o/${orgId}?still=1`);
  const remoteCount = page.locator('text=Team Presence').locator('..').getByText('Remote', { exact: true }).locator('xpath=following-sibling::span[1]');
  await expect(remoteCount).toBeVisible();
  const before = Number(await remoteCount.textContent());

  const other = await browser.newContext();
  const req = other.request;
  await req.post('/api/auth/login', { data: { email: 'faisal@juniper.demo', password: PASSWORD }, headers: { 'x-space-csrf': '1' } });
  const me = await (await req.get('/api/auth/me')).json();
  const wasRemote = (await (await req.get(`/api/orgs/${orgId}`)).json()).me.presence === 'remote';
  await req.patch(`/api/orgs/${orgId}/me`, { data: { presence: wasRemote ? 'working' : 'remote' }, headers: { 'x-space-csrf': '1' } });
  await expect(remoteCount).toHaveText(String(before + (wasRemote ? -1 : 1)), { timeout: 30_000 });
  // restore
  await req.patch(`/api/orgs/${orgId}/me`, { data: { presence: wasRemote ? 'remote' : 'in_meeting' }, headers: { 'x-space-csrf': '1' } });
  expect(me.user.email).toBe('faisal@juniper.demo');
  await other.close();
});
