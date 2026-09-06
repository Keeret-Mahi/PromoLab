import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_EXPECTATIONS } from '../src/data/fixtures.ts';
import type {
  Discount,
  DiscountCode,
  ExecutionResult,
  Scenario,
} from '../src/domain/types.ts';
import { validateScenario } from '../src/engine/validator.ts';
import { mapShopifyDiscounts } from '../src/shopify/mapper.ts';
import { MOCK_SHOPIFY_DISCOUNTS_RESPONSE } from '../src/server/shopify/mock-data.ts';

function normalizedLiveDiscounts(): Discount[] {
  const response = structuredClone(MOCK_SHOPIFY_DISCOUNTS_RESPONSE);
  const summer = response.discountNodes.nodes.find(({ discount }) =>
    'codes' in discount
    && discount.codes.nodes.some(({ code }) => code === 'SUMMER20'),
  )?.discount;
  if (!summer || !('discountClasses' in summer)) {
    throw new Error('SUMMER20 discount fixture is missing.');
  }
  summer.discountClasses = ['PRODUCT'];
  return mapShopifyDiscounts(response);
}

const monitorScenario: Scenario = {
  id: 'monitor-summer20',
  sequence: 1,
  cart: {
    id: 'monitor-cart',
    name: 'Monitor',
    description: '$200 Monitor',
    lines: [{
      merchandiseId: 'gid://shopify/ProductVariant/200',
      sku: 'MONITOR-200',
      title: 'Monitor',
      quantity: 1,
      unitPrice: 200,
    }],
    shippingPrice: 0,
  },
  discountCodes: ['SUMMER20'],
};

function completedExecution(
  scenario: Scenario,
  appliedDiscounts: DiscountCode[],
  amounts: { product?: number; order?: number; shipping?: number },
): ExecutionResult {
  const productDiscount = amounts.product ?? 0;
  const orderDiscount = amounts.order ?? 0;
  const shippingDiscount = amounts.shipping ?? 0;
  const subtotal = 200;
  return {
    scenarioId: scenario.id,
    status: 'completed',
    attemptedDiscountCodes: [...scenario.discountCodes],
    discountCodes: scenario.discountCodes.map((code) => ({
      code,
      applicable: appliedDiscounts.includes(code),
    })),
    discountAllocations: [],
    lines: [],
    userErrors: [],
    warnings: [],
    currencyCode: 'CAD',
    subtotal,
    productDiscount,
    orderDiscount,
    shippingDiscount,
    shippingPrice: scenario.cart.shippingPrice,
    total: subtotal
      - productDiscount
      - orderDiscount
      + scenario.cart.shippingPrice
      - shippingDiscount,
    appliedDiscounts,
    rejectedDiscounts: scenario.discountCodes
      .filter((code) => !appliedDiscounts.includes(code))
      .map((code) => ({ code, reason: 'Shopify returned this code as not applicable.' })),
    notes: [],
  };
}

test('uses normalized PRODUCT classification for SUMMER20 expected savings', () => {
  const discounts = normalizedLiveDiscounts();
  assert.equal(discounts.find(({ code }) => code === 'SUMMER20')?.category, 'product');

  const result = validateScenario(
    monitorScenario,
    completedExecution(monitorScenario, ['SUMMER20'], { product: 40 }),
    DEFAULT_EXPECTATIONS,
    discounts,
  );

  assert.equal(result.status, 'pass');
});

test('rejects an order allocation when normalized SUMMER20 is a product discount', () => {
  const discounts = normalizedLiveDiscounts();

  const result = validateScenario(
    monitorScenario,
    completedExecution(monitorScenario, ['SUMMER20'], { order: 40 }),
    DEFAULT_EXPECTATIONS,
    discounts,
  );

  assert.equal(result.status, 'fail');
  assert.match(
    result.detail,
    /Expected product\/order\/shipping savings of \$40\.00 \/ \$0\.00 \/ \$0\.00/,
  );
});

test('keeps normalized WELCOME10 savings in the ORDER allocation', () => {
  const discounts = normalizedLiveDiscounts();
  const scenario = {
    ...monitorScenario,
    id: 'monitor-welcome10',
    discountCodes: ['WELCOME10'],
  };
  assert.equal(discounts.find(({ code }) => code === 'WELCOME10')?.category, 'order');

  const result = validateScenario(
    scenario,
    completedExecution(scenario, ['WELCOME10'], { order: 20 }),
    DEFAULT_EXPECTATIONS,
    discounts,
  );

  assert.equal(result.status, 'pass');
});

test('classifies matching SUMMER20 plus WELCOME10 behavior as an expected conflict', () => {
  const discounts = normalizedLiveDiscounts();
  const scenario = {
    ...monitorScenario,
    id: 'monitor-summer-welcome',
    discountCodes: ['SUMMER20', 'WELCOME10'],
  };

  const result = validateScenario(
    scenario,
    completedExecution(scenario, ['SUMMER20'], { product: 40 }),
    DEFAULT_EXPECTATIONS,
    discounts,
  );

  assert.equal(result.status, 'warning');
  assert.deepEqual(result.expectedDiscounts, ['SUMMER20']);
  assert.match(result.reason, /Expected incompatibility confirmed/);
});

test('keeps normalized FREESHIP savings in the SHIPPING allocation', () => {
  const discounts = normalizedLiveDiscounts();
  const scenario = {
    ...monitorScenario,
    id: 'monitor-freeship',
    cart: { ...monitorScenario.cart, shippingPrice: 10 },
    discountCodes: ['FREESHIP'],
  };
  assert.equal(discounts.find(({ code }) => code === 'FREESHIP')?.category, 'shipping');

  const result = validateScenario(
    scenario,
    completedExecution(scenario, ['FREESHIP'], { shipping: 10 }),
    DEFAULT_EXPECTATIONS,
    discounts,
  );

  assert.equal(result.status, 'pass');
});
