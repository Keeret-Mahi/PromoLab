import assert from 'node:assert/strict';
import test from 'node:test';
import { MockShopifyExecutionAdapter } from '../src/adapters/shopify-execution.ts';
import { createPreflightRuntime } from '../src/server/preflight.ts';
import { RealShopifyService } from '../src/server/shopify/real-service.ts';
import { RealShopifyExecutionAdapter } from '../src/server/shopify/storefront/real-execution-adapter.ts';

test('live Admin data can be paired with simulated execution without making a request', () => {
  const runtime = createPreflightRuntime({
    SHOPIFY_DATA_MODE: 'live',
    SHOPIFY_EXECUTION_MODE: 'mock',
    SHOPIFY_SHOP: 'promo-lab-test',
    SHOPIFY_CLIENT_ID: 'test-client-id',
    SHOPIFY_CLIENT_SECRET: 'test-client-secret',
  } as unknown as NodeJS.ProcessEnv);

  assert.deepEqual(runtime.modes, { dataMode: 'live', executionMode: 'mock' });
  assert.ok(runtime.shopifyService instanceof RealShopifyService);
  assert.ok(runtime.executor instanceof MockShopifyExecutionAdapter);
});

test('live execution requires live Admin data so mock product GIDs cannot reach Storefront', () => {
  assert.throws(
    () => createPreflightRuntime({
      SHOPIFY_DATA_MODE: 'mock',
      SHOPIFY_EXECUTION_MODE: 'live',
    } as unknown as NodeJS.ProcessEnv),
    /SHOPIFY_EXECUTION_MODE=live requires SHOPIFY_DATA_MODE=live/i,
  );
});

test('live execution fails clearly when the Storefront credential is missing', () => {
  assert.throws(
    () => createPreflightRuntime({
      SHOPIFY_DATA_MODE: 'live',
      SHOPIFY_EXECUTION_MODE: 'live',
      SHOPIFY_SHOP: 'promo-lab-test',
      SHOPIFY_CLIENT_ID: 'test-client-id',
      SHOPIFY_CLIENT_SECRET: 'test-client-secret',
    } as unknown as NodeJS.ProcessEnv),
    /SHOPIFY_STOREFRONT_ACCESS_TOKEN is required when SHOPIFY_EXECUTION_MODE=live/i,
  );
});

test('live execution selects the real adapter without making a request', () => {
  const fetchImpl = (() => {
    throw new Error('Construction must not make a Storefront request.');
  }) as typeof fetch;
  const runtime = createPreflightRuntime({
    SHOPIFY_DATA_MODE: 'live',
    SHOPIFY_EXECUTION_MODE: 'live',
    SHOPIFY_SHOP: 'promo-lab-test',
    SHOPIFY_CLIENT_ID: 'test-client-id',
    SHOPIFY_CLIENT_SECRET: 'test-client-secret',
    SHOPIFY_STOREFRONT_ACCESS_TOKEN: 'test-storefront-token',
  } as unknown as NodeJS.ProcessEnv, { storefront: { fetch: fetchImpl } });

  assert.deepEqual(runtime.modes, { dataMode: 'live', executionMode: 'live' });
  assert.ok(runtime.shopifyService instanceof RealShopifyService);
  assert.ok(runtime.executor instanceof RealShopifyExecutionAdapter);
});
