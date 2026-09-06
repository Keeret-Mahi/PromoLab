import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { handlePreflightPost } from '../app/api/preflight/route.ts';
import { executeMockScenario } from '../src/adapters/shopify-execution.ts';
import { DEFAULT_PROMPT } from '../src/data/fixtures.ts';
import type { ServerPreflightRuntime } from '../src/server/preflight.ts';
import {
  prepareServerPreflight,
  runServerPreflight,
} from '../src/server/preflight.ts';
import { MockShopifyService } from '../src/server/shopify/mock-service.ts';

function trackedLiveRuntime() {
  let executions = 0;
  const runtime: ServerPreflightRuntime = {
    modes: { dataMode: 'live', executionMode: 'live' },
    shopifyService: new MockShopifyService(),
    executor: {
      execute: async (scenario, discounts) => {
        executions += 1;
        return executeMockScenario(scenario, discounts);
      },
    },
  };
  return { runtime, executionCount: () => executions };
}

test('live page preparation queues scenarios without executing Storefront carts', async () => {
  const { runtime, executionCount } = trackedLiveRuntime();

  const report = await prepareServerPreflight(DEFAULT_PROMPT, runtime);
  const pageSource = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');

  assert.equal(executionCount(), 0);
  assert.equal(report.results.length, 0);
  assert.deepEqual(report.scenarios.map((scenario) => scenario.discountCodes), [
    ['SUMMER20'],
    ['WELCOME10'],
    ['SUMMER20', 'WELCOME10'],
  ]);
  assert.match(pageSource, /prepareServerPreflight\(DEFAULT_PROMPT\)/);
  assert.doesNotMatch(pageSource, /runServerPreflight/);
});

test('the explicit preflight POST executes the queued live scenarios', async () => {
  const { runtime, executionCount } = trackedLiveRuntime();
  const request = new Request('http://localhost/api/preflight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent: DEFAULT_PROMPT }),
  });

  const response = await handlePreflightPost(
    request,
    (intent) => runServerPreflight(intent, runtime),
  );
  const report = await response.json() as { results: unknown[] };

  assert.equal(response.status, 200);
  assert.equal(executionCount(), 3);
  assert.equal(report.results.length, 3);
});
