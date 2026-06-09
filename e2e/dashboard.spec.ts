import { test, expect } from '@playwright/test';

test.describe('loftPOS Admin Dashboard E2E Tests', () => {

  test('Route Protection: Redirects unauthenticated users to /login', async ({ page }) => {
    // Navigate directly to dashboard
    await page.goto('/dashboard');
    
    // Check that we are redirected to /login
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('h1')).toContainText('loftPOS');
    await expect(page.locator('button[type="submit"]')).toContainText('Sign In');
  });

  test('Login Flow: Shows error with invalid credentials', async ({ page }) => {
    await page.goto('/login');

    // Intercept Supabase Auth request to return bad credentials error
    await page.route('**/auth/v1/token?grant_type=password', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'invalid_credentials',
          error_description: 'Invalid login credentials',
        }),
      });
    });

    await page.fill('input[type="email"]', 'wrong@loftpos.com');
    await page.fill('input[type="password"]', 'wrongpass');
    await page.click('button[type="submit"]');

    // Verify error box displays error description
    const errorAlert = page.locator('text=Invalid login credentials');
    await expect(errorAlert).toBeVisible();
  });

  test('Login Flow & Dashboard: Successful login redirect and stats verification', async ({ page }) => {
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    await page.goto('/login');

    // Intercept Supabase Auth request for successful login
    await page.route('**/auth/v1/token?grant_type=password', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mocked-jwt-token-xyz',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mocked-refresh-token-abc',
          user: { id: 'mock-uuid', email: 'owner@loftpos.com' },
        }),
      });
    });

    // Intercept initial transaction loading
    await page.route('**/rest/v1/transactions*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'trx-1',
            trx_number: 'TRX-20260606-001',
            amount: 50000,
            payment_method: 'CASH',
            status: 'PAID',
            created_at: new Date().toISOString(),
          },
          {
            id: 'trx-2',
            trx_number: 'TRX-20260606-002',
            amount: 35000,
            payment_method: 'QRIS',
            status: 'PAID',
            created_at: new Date().toISOString(),
          }
        ]),
      });
    });

    // Enter email and password
    await page.fill('input[type="email"]', 'owner@loftpos.com');
    await page.fill('input[type="password"]', 'correctpassword');
    await page.click('button[type="submit"]');

    // Check we got redirected to /dashboard
    await expect(page).toHaveURL(/\/dashboard/);

    // Verify dashboard displays logged in user email
    await expect(page.locator('text=owner@loftpos.com')).toBeVisible();

    // Verify stats calculation: Total: Rp 85.000, Cash: Rp 50.000, QRIS: Rp 35.000
    await expect(page.locator('text=Rp 85.000').first()).toBeVisible();
    await expect(page.locator('text=Rp 50.000').first()).toBeVisible();
    await expect(page.locator('text=Rp 35.000').first()).toBeVisible();

    // Verify the transaction records are rendered in table
    await expect(page.locator('text=TRX-20260606-001')).toBeVisible();
    await expect(page.locator('text=TRX-20260606-002')).toBeVisible();
  });
});
