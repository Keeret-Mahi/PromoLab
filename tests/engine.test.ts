import assert from 'node:assert/strict';
import test from 'node:test';
import { MockIntentParser } from '../src/adapters/intent-parser.ts';
import { buildDemoReport } from '../src/engine/run-preflight.ts';

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

test('mock intent parser extracts edited percentages and thresholds', async () => {
  const parsed = await new MockIntentParser().parse(
    'SUMMER20 should give 25% off. Free shipping should apply over $120.',
  );

  assert.equal(parsed.rules.find((rule) => rule.id === 'summer-value')?.value, 25);
  assert.equal(parsed.rules.find((rule) => rule.id === 'shipping-threshold')?.threshold, 120);
});
