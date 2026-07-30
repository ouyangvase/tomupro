import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

type AuditCredentials = {
  email: string;
  password: string;
};

type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user: unknown;
};

const projectRef = 'dtcchduronwsyunyakxj';
const storageKey = `sb-${projectRef}-auth-token`;
const auditCredentialsPath =
  process.env.TOMUPRO_AUDIT_CREDENTIALS ||
  join(tmpdir(), 'tomupro-orders-admin-audit.json');

async function readCredentials(): Promise<AuditCredentials> {
  const contents = (await readFile(auditCredentialsPath, 'utf8')).replace(/^\uFEFF/, '');
  return JSON.parse(contents) as AuditCredentials;
}

async function createSession(request: APIRequestContext) {
  const credentials = await readCredentials();
  const supabaseUrl = process.env.TOMUPRO_SUPABASE_URL;
  const anonKey = process.env.TOMUPRO_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error('TOMUPRO_SUPABASE_URL and TOMUPRO_SUPABASE_ANON_KEY are required.');
  }

  const response = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey },
    data: credentials,
  });

  expect(response.ok(), 'temporary audit user should authenticate').toBeTruthy();
  return (await response.json()) as SupabaseSession;
}

async function seedSession(context: BrowserContext, session: SupabaseSession) {
  await context.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: storageKey, value: session },
  );
}

async function dismissOnboarding(page: Page, timeout = 500) {
  const skipButton = page.getByRole('button', { name: 'Skip onboarding' });
  if (await skipButton.isVisible({ timeout }).catch(() => false)) {
    await skipButton.click();
  }
}

async function observeFirstLoad(page: Page, slowNetwork = false) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const orderResponses: Array<{ method: string; status: number; url: string }> = [];

  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleErrors.push(message.text());
    }
  });
  page.on('requestfailed', (request) => {
    if (request.url().includes(projectRef) && request.method() !== 'HEAD') {
      failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText}`);
    }
  });
  page.on('response', (response) => {
    const request = response.request();
    if (request.url().includes(`${projectRef}.supabase.co/rest/v1/orders`)) {
      orderResponses.push({
        method: request.method(),
        status: response.status(),
        url: request.url(),
      });
    }
  });

  if (slowNetwork) {
    await page.route(`https://${projectRef}.supabase.co/**`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      await route.continue();
    });
  }

  await page.addInitScript(() => {
    const inspect = () => {
      const text = document.body?.innerText || '';
      if (text.includes('No ready orders') || text.includes('No orders to dispatch')) {
        (window as typeof window & { __ordersFalseEmptySeen?: boolean }).__ordersFalseEmptySeen = true;
      }
    };
    window.addEventListener('DOMContentLoaded', () => {
      inspect();
      new MutationObserver(inspect).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });
  });

  const startedAt = Date.now();
  await page.goto('/orders?tab=ready', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Ready Orders' })).toBeVisible();
  await dismissOnboarding(page);

  let dataSeen = false;
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline && !dataSeen) {
    dataSeen = (await page.locator('[data-order-id]').count()) > 0;
    if (!dataSeen) {
      await page.waitForTimeout(100);
    }
  }

  return {
    durationMs: Date.now() - startedAt,
    falseEmptySeen: await page.evaluate(
      () => Boolean((window as typeof window & { __ordersFalseEmptySeen?: boolean }).__ordersFalseEmptySeen),
    ),
    dataSeen,
    consoleErrors,
    failedRequests,
    orderResponses,
    mainOrderRequestCount: orderResponses.filter(
      (response) => response.method === 'GET' && response.url.includes('order_items'),
    ).length,
  };
}

test('cold Orders load never renders a false empty state', async ({ context, page, request }, testInfo) => {
  await seedSession(context, await createSession(request));
  const result = await observeFirstLoad(page);

  await testInfo.attach('orders-first-load.json', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  expect(result.dataSeen).toBeTruthy();
  expect(result.falseEmptySeen).toBeFalsy();
  expect(result.failedRequests).toEqual([]);
  expect(result.consoleErrors.filter((entry) => entry.includes('[Auth]'))).toEqual([]);
  expect(result.mainOrderRequestCount).toBe(1);
});

test('slow Orders load keeps a loading state until data is ready', async ({ context, page, request }, testInfo) => {
  await seedSession(context, await createSession(request));
  const result = await observeFirstLoad(page, true);

  await testInfo.attach('orders-slow-first-load.json', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  expect(result.dataSeen).toBeTruthy();
  expect(result.falseEmptySeen).toBeFalsy();
  expect(result.failedRequests).toEqual([]);
  expect(result.mainOrderRequestCount).toBe(1);
});

test('mobile direct Orders load renders data without a false empty state', async ({
  context,
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedSession(context, await createSession(request));
  const result = await observeFirstLoad(page);

  expect(result.dataSeen).toBeTruthy();
  expect(result.falseEmptySeen).toBeFalsy();
  expect(result.failedRequests).toEqual([]);
  expect(result.mainOrderRequestCount).toBe(1);
});

test('Orders query failure renders a retryable error instead of an empty state', async ({
  context,
  page,
  request,
}) => {
  await seedSession(context, await createSession(request));
  await page.route(`https://${projectRef}.supabase.co/rest/v1/orders**`, async (route) => {
    if (route.request().method() === 'GET' && route.request().url().includes('order_items')) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Temporary audit failure' }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/orders?tab=ready', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Ready Orders' })).toBeVisible();
  await dismissOnboarding(page);
  await expect(page.getByText('Unable to load orders')).toBeVisible({ timeout: 20_000 });
  await dismissOnboarding(page, 3_000);
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.getByText('No orders to dispatch')).toHaveCount(0);
  await expect(page.getByText('No ready orders')).toHaveCount(0);
});

test('a confirmed empty response renders the empty state only after loading settles', async ({
  context,
  page,
  request,
}) => {
  await seedSession(context, await createSession(request));
  await page.route(`https://${projectRef}.supabase.co/rest/v1/orders**`, async (route) => {
    if (route.request().method() === 'GET' && route.request().url().includes('order_items')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '*/0' },
        body: '[]',
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/orders?tab=ready', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Ready Orders' })).toBeVisible();
  await dismissOnboarding(page, 3_000);
  await expect(page.getByText('Loading orders...')).toHaveCount(0);
  await expect(page.getByText('No orders to dispatch')).toBeVisible();
});
