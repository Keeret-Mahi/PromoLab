import assert from 'node:assert/strict';
import test from 'node:test';
import type { Scenario } from '../src/domain/types.ts';
import { mapShopifyDiscounts } from '../src/shopify/mapper.ts';
import {
  mapStorefrontCartExecution,
  normalizeStorefrontUserErrors,
} from '../src/shopify/storefront-mapper.ts';
import type { StorefrontCart } from '../src/shopify/storefront-types.ts';
import { MOCK_SHOPIFY_DISCOUNTS_RESPONSE } from '../src/server/shopify/mock-data.ts';

const scenario: Scenario = {
  id: 'live-summer-welcome',
  sequence: 1,
  cart: {
    id: 'live-cart',
    name: 'TechNest Keyboard',
    description: 'Live product',
    lines: [{
      merchandiseId: 'gid://shopify/ProductVariant/101',
      sku: 'TECH-101',
      title: 'TechNest Keyboard',
      quantity: 1,
      unitPrice: 100,
    }],
    shippingPrice: 0,
  },
  discountCodes: ['SUMMER20', 'WELCOME10'],
};

const application = {
  __typename: 'CartCodeDiscountApplication',
  targetType: 'LINE_ITEM',
  targetSelection: 'ALL',
  totalAllocatedAmount: { amount: '20.00', currencyCode: 'CAD' },
  code: 'SUMMER20',
};

function storefrontCart(): StorefrontCart {
  return {
    id: 'gid://shopify/Cart/1',
    discountCodes: [
      { code: 'SUMMER20', applicable: true },
      { code: 'WELCOME10', applicable: false },
    ],
    discountApplications: [application],
    cost: {
      subtotalAmount: { amount: '100.00', currencyCode: 'CAD' },
      totalAmount: { amount: '80.00', currencyCode: 'CAD' },
    },
    lines: {
      nodes: [{
        id: 'gid://shopify/CartLine/1',
        quantity: 1,
        merchandise: {
          __typename: 'ProductVariant',
          id: 'gid://shopify/ProductVariant/101',
          title: 'Default',
          sku: 'TECH-101',
        },
        cost: {
          subtotalAmount: { amount: '100.00', currencyCode: 'CAD' },
          totalAmount: { amount: '80.00', currencyCode: 'CAD' },
        },
        discountAllocations: [{
          __typename: 'CartCodeDiscountAllocation',
          discountedAmount: { amount: '20.00', currencyCode: 'CAD' },
          targetType: 'LINE_ITEM',
          sourceDiscountApplication: application,
        }],
      }],
    },
  };
}

test('normalizes Shopify-calculated codes, allocations, line amounts, totals, and currency', () => {
  const result = mapStorefrontCartExecution(
    scenario,
    mapShopifyDiscounts(MOCK_SHOPIFY_DISCOUNTS_RESPONSE),
    storefrontCart(),
  );

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.attemptedDiscountCodes, ['SUMMER20', 'WELCOME10']);
  assert.deepEqual(result.discountCodes, [
    { code: 'SUMMER20', applicable: true },
    { code: 'WELCOME10', applicable: false },
  ]);
  assert.deepEqual(result.appliedDiscounts, ['SUMMER20']);
  assert.equal(result.rejectedDiscounts[0]?.code, 'WELCOME10');
  assert.equal(result.discountAllocations[0]?.amount, 20);
  assert.equal(result.discountAllocations[0]?.sourceType, 'CartCodeDiscountApplication');
  assert.equal(result.lines[0]?.discountAmount, 20);
  assert.equal(result.subtotal, 100);
  assert.equal(result.orderDiscount, 20);
  assert.equal(result.total, 80);
  assert.equal(result.currencyCode, 'CAD');
});

test('normalizes Merchandise as the pre-discount line subtotal for product discounts', () => {
  const discounts = mapShopifyDiscounts(MOCK_SHOPIFY_DISCOUNTS_RESPONSE);
  const summer = discounts.find(({ code }) => code === 'SUMMER20');
  assert.ok(summer);
  summer.category = 'product';

  const cart = structuredClone(storefrontCart());
  cart.cost.subtotalAmount.amount = '160.00';
  cart.cost.totalAmount.amount = '160.00';
  cart.discountApplications[0]!.totalAllocatedAmount.amount = '40.00';
  cart.lines.nodes[0]!.cost.subtotalAmount.amount = '200.00';
  cart.lines.nodes[0]!.cost.totalAmount.amount = '160.00';
  cart.lines.nodes[0]!.discountAllocations[0]!.discountedAmount.amount = '40.00';
  cart.lines.nodes[0]!
    .discountAllocations[0]!
    .sourceDiscountApplication.totalAllocatedAmount.amount = '40.00';

  const result = mapStorefrontCartExecution(scenario, discounts, cart);

  assert.equal(result.subtotal, 200);
  assert.equal(result.productDiscount, 40);
  assert.equal(result.orderDiscount, 0);
  assert.equal(result.total, 160);
});

test('normalizes Storefront cart mutation user errors with their stage', () => {
  const errors = normalizeStorefrontUserErrors('cartDiscountCodesUpdate', [{
    field: ['discountCodes', '0'],
    message: 'Discount code is invalid',
    code: 'INVALID',
  }]);

  assert.deepEqual(errors, [{
    stage: 'cartDiscountCodesUpdate',
    field: ['discountCodes', '0'],
    message: 'Discount code is invalid',
    code: 'INVALID',
  }]);
});
