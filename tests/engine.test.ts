import assert from 'node:assert/strict';
import test from 'node:test';
import { MockIntentParser } from '../src/adapters/intent-parser.ts';
import { executeMockScenario } from '../src/adapters/shopify-execution.ts';
import { DEFAULT_EXPECTATIONS } from '../src/data/fixtures.ts';
import { buildPreflightReport, runPreflight } from '../src/engine/run-preflight.ts';
import { generateScenarios } from '../src/engine/scenario-generator.ts';
import { mapShopifyDiscounts } from '../src/shopify/mapper.ts';
import { MOCK_SHOPIFY_DISCOUNTS_RESPONSE } from '../src/server/shopify/mock-data.ts';

function buildDemoReport() {
  const discounts = mapShopifyDiscounts(MOCK_SHOPIFY_DISCOUNTS_RESPONSE)
    .map((discount) => ({ ...discount, source: 'mock' as const }));
  const scenarios = generateScenarios(discounts);
  const executions = scenarios.map((scenario) => executeMockScenario(scenario, discounts));
  return buildPreflightReport(DEFAULT_EXPECTATIONS, discounts, scenarios, executions);
}

test('generates every single and pair across four representative carts', () => {
  const report = buildDemoReport();

  assert.equal(report.scenarios.length, 40);
  assert.equal(new Set(report.scenarios.map((scenario) => scenario.cart.id)).size, 4);
  assert.equal(
    new Set(report.scenarios.map((scenario) => scenario.discountCodes.join('+'))).size,
    10,
  );
});

test('classifies the declared order-code incompatibility as an expected warning', () => {
  const report = buildDemoReport();
  const result = report.results.find(
    ({ scenario }) =>
      scenario.cart.id === 'starter-cart'
      && scenario.discountCodes.includes('WELCOME10')
      && scenario.discountCodes.includes('SUMMER20'),
  );

  assert.ok(result);
  assert.equal(result.status, 'warning');
  assert.deepEqual(result.execution.appliedDiscounts, ['SUMMER20']);
});

test('flags the post-discount shipping threshold as an unexpected interaction', () => {
  const report = buildDemoReport();
  const result = report.results.find(
    ({ scenario }) =>
      scenario.cart.id === 'threshold-cart'
      && scenario.discountCodes.includes('FREESHIP')
      && scenario.discountCodes.includes('SUMMER20'),
  );

  assert.ok(result);
  assert.equal(result.status, 'fail');
  assert.match(result.detail, /post-discount subtotal/i);
  assert.ok(result.expectedDiscounts.includes('FREESHIP'));
});

test('flags BUY2GET1 when its Shopify combination policy conflicts with the intent', () => {
  const report = buildDemoReport();
  const result = report.results.find(
    ({ scenario }) =>
      scenario.cart.id === 'tee-trio'
      && scenario.discountCodes.includes('BUY2GET1')
      && scenario.discountCodes.includes('SUMMER20'),
  );

  assert.ok(result);
  assert.equal(result.status, 'fail');
  assert.ok(result.expectedDiscounts.includes('BUY2GET1'));
  assert.ok(!result.execution.appliedDiscounts.includes('BUY2GET1'));
});

test('structured rule parser keeps the focused two-rule contract and extracts edited percentages', async () => {
  const parsed = await new MockIntentParser().parse(
    'SUMMER20 should give 25% off eligible products and not stack with WELCOME10.',
  );

  assert.equal(parsed.rules.length, 2);
  assert.equal(parsed.rules.find((rule) => rule.id === 'summer-value')?.value, 25);
  assert.equal(parsed.rules.find((rule) => rule.id === 'shipping-threshold'), undefined);
  assert.equal(parsed.rules.find((rule) => rule.id === 'bogo-independence'), undefined);
});

test('simulated execution rejects unsupported live discount codes instead of fabricating a result', () => {
  const discounts = mapShopifyDiscounts(MOCK_SHOPIFY_DISCOUNTS_RESPONSE);
  const scenario = {
    ...generateScenarios(discounts)[0],
    discountCodes: ['REALSTORECODE'],
  };

  assert.throws(
    () => executeMockScenario(scenario, discounts),
    /Simulated execution does not support: REALSTORECODE.*No Shopify execution result was produced/i,
  );
});

test('live Storefront scenarios execute sequentially in generated order', async () => {
  const discounts = mapShopifyDiscounts(MOCK_SHOPIFY_DISCOUNTS_RESPONSE);
  const baseScenario = generateScenarios(discounts)[0]!;
  const liveScenarios = [
    { ...baseScenario, id: 'live-summer20', sequence: 1, discountCodes: ['SUMMER20'] },
    { ...baseScenario, id: 'live-welcome10', sequence: 2, discountCodes: ['WELCOME10'] },
    {
      ...baseScenario,
      id: 'live-summer20-welcome10',
      sequence: 3,
      discountCodes: ['SUMMER20', 'WELCOME10'],
    },
  ];
  let activeExecutions = 0;
  let maximumConcurrency = 0;
  const started: string[] = [];

  await runPreflight('Test SUMMER20 and WELCOME10.', {
    intentParser: new MockIntentParser(),
    discountReader: { getActiveDiscounts: async () => discounts },
    executor: {
      execute: async (currentScenario, currentDiscounts) => {
        started.push(currentScenario.discountCodes.join(' + '));
        activeExecutions += 1;
        maximumConcurrency = Math.max(maximumConcurrency, activeExecutions);
        await new Promise((resolve) => setTimeout(resolve, 5));
        const result = executeMockScenario(currentScenario, currentDiscounts);
        activeExecutions -= 1;
        return result;
      },
    },
    runtime: { dataMode: 'live', executionMode: 'live' },
    scenarioBuilder: () => liveScenarios,
  });

  assert.deepEqual(started, [
    'SUMMER20',
    'WELCOME10',
    'SUMMER20 + WELCOME10',
  ]);
  assert.equal(maximumConcurrency, 1);
});

test('live preflight uses the adapter batch boundary for reusable carts', async () => {
  const discounts = mapShopifyDiscounts(MOCK_SHOPIFY_DISCOUNTS_RESPONSE);
  const scenarios = generateScenarios(discounts).slice(0, 3);
  let batchExecutions = 0;
  let singleExecutions = 0;

  const report = await runPreflight('Test the selected discount combinations.', {
    intentParser: new MockIntentParser(),
    discountReader: { getActiveDiscounts: async () => discounts },
    executor: {
      execute: async (scenario, currentDiscounts) => {
        singleExecutions += 1;
        return executeMockScenario(scenario, currentDiscounts);
      },
      executeScenarios: async (currentScenarios, currentDiscounts) => {
        batchExecutions += 1;
        return currentScenarios.map((scenario) =>
          executeMockScenario(scenario, currentDiscounts),
        );
      },
    },
    runtime: { dataMode: 'live', executionMode: 'live' },
    scenarioBuilder: () => scenarios,
  });

  assert.equal(batchExecutions, 1);
  assert.equal(singleExecutions, 0);
  assert.equal(report.results.length, 3);
});
