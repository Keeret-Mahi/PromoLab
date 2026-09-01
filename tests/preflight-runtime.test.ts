import assert from 'node:assert/strict';
import test from 'node:test';
import { MockShopifyExecutionAdapter } from '../src/adapters/shopify-execution.ts';
import { createPreflightRuntime } from '../src/server/preflight.ts';
import { RealShopifyService } from '../src/server/shopify/real-service.ts';

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

test('live execution fails clearly before selecting any fallback adapter', () => {
  assert.throws(
    () => createPreflightRuntime({
      SHOPIFY_DATA_MODE: 'mock',
      SHOPIFY_EXECUTION_MODE: 'live',
    } as unknown as NodeJS.ProcessEnv),
    /SHOPIFY_EXECUTION_MODE=live is not available yet[\s\S]*Storefront Cart API adapter/i,
  );
});
