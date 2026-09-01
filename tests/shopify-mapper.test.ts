import assert from 'node:assert/strict';
import test from 'node:test';
import { mapShopifyDiscounts } from '../src/shopify/mapper.ts';
import { MOCK_SHOPIFY_DISCOUNTS_RESPONSE } from '../src/server/shopify/mock-data.ts';

test('maps Shopify discount unions into the stable PromoLab model', () => {
  const discounts = mapShopifyDiscounts(MOCK_SHOPIFY_DISCOUNTS_RESPONSE);

  assert.equal(discounts.length, 4);
  assert.deepEqual(discounts.map((discount) => discount.code), [
    'WELCOME10',
    'SUMMER20',
    'FREESHIP',
    'BUY2GET1',
  ]);
  assert.ok(discounts.every((discount) => discount.source === 'shopify'));
  assert.ok(discounts.every((discount) => discount.status === 'active'));
});

test('normalizes percentage, threshold, and BOGO eligibility fields', () => {
  const discounts = mapShopifyDiscounts(MOCK_SHOPIFY_DISCOUNTS_RESPONSE);
  const welcome = discounts.find((discount) => discount.code === 'WELCOME10');
  const shipping = discounts.find((discount) => discount.code === 'FREESHIP');
  const bogo = discounts.find((discount) => discount.code === 'BUY2GET1');

  assert.deepEqual(welcome?.value, { kind: 'percentage', percentage: 10 });
  assert.equal(shipping?.category, 'shipping');
  assert.equal(shipping?.eligibility.minimumSubtotal, 75);
  assert.deepEqual(bogo?.value, {
    kind: 'buy-x-get-y',
    buyQuantity: 2,
    getQuantity: 1,
    getPercentage: 100,
  });
  assert.deepEqual(bogo?.eligibility.skus, ['TEE-CLASSIC']);
  assert.equal(bogo?.eligibility.minimumQuantity, 3);
});

test('preserves collection eligibility and safely normalizes Shopify Functions discounts', () => {
  const response = structuredClone(MOCK_SHOPIFY_DISCOUNTS_RESPONSE);
  const basic = response.discountNodes.nodes[0]?.discount;
  assert.equal(basic?.__typename, 'DiscountCodeBasic');
  if (basic?.__typename !== 'DiscountCodeBasic') return;
  basic.customerGets.items = {
    __typename: 'DiscountCollections',
    collections: { nodes: [{ id: 'gid://shopify/Collection/sale' }] },
  };

  response.discountNodes.nodes.push({
    id: 'gid://shopify/DiscountCodeNode/app-managed',
    discount: {
      __typename: 'DiscountCodeApp',
      title: 'Loyalty function',
      status: 'ACTIVE',
      startsAt: '2026-01-01T00:00:00Z',
      endsAt: null,
      discountClasses: ['PRODUCT'],
      codes: { nodes: [{ code: 'LOYALTY' }] },
      combinesWith: {
        orderDiscounts: true,
        productDiscounts: false,
        shippingDiscounts: true,
      },
      appDiscountType: {
        title: 'Loyalty discount',
        description: 'Custom loyalty pricing supplied by a Shopify Function.',
      },
    },
  });

  const discounts = mapShopifyDiscounts(response);
  assert.deepEqual(discounts[0]?.eligibility.collectionIds, ['gid://shopify/Collection/sale']);
  assert.deepEqual(discounts.at(-1)?.value, { kind: 'unknown' });
  assert.equal(discounts.at(-1)?.summary, 'Custom loyalty pricing supplied by a Shopify Function.');
  assert.equal(discounts.at(-1)?.eligibility.allProducts, false);
});
