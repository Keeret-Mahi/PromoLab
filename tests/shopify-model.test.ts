import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPromoLabDiscount,
  assertPromoLabProduct,
} from '../src/shopify/model.ts';
import {
  mapShopifyDiscounts,
  mapShopifyProducts,
} from '../src/shopify/mapper.ts';
import {
  MOCK_SHOPIFY_DISCOUNTS_RESPONSE,
  MOCK_SHOPIFY_PRODUCTS_RESPONSE,
} from '../src/server/shopify/mock-data.ts';

test('accepts every mapped discount as a valid normalized model', () => {
  for (const discount of mapShopifyDiscounts(MOCK_SHOPIFY_DISCOUNTS_RESPONSE)) {
    assert.doesNotThrow(() => assertPromoLabDiscount(discount));
  }
});

test('accepts normalized Shopify products', () => {
  for (const product of mapShopifyProducts(MOCK_SHOPIFY_PRODUCTS_RESPONSE)) {
    assert.doesNotThrow(() => assertPromoLabProduct(product));
  }
});

test('rejects incomplete and invalid normalized discounts', () => {
  assert.throws(() => assertPromoLabDiscount({ code: 'BROKEN' }), /id, code, and title/i);

  const valid = mapShopifyDiscounts(MOCK_SHOPIFY_DISCOUNTS_RESPONSE)[0];
  assert.throws(
    () => assertPromoLabDiscount({ ...valid, value: { kind: 'percentage', percentage: 0 } }),
    /positive percentage/i,
  );
  assert.throws(
    () => assertPromoLabDiscount({
      ...valid,
      eligibility: { ...valid.eligibility, collectionIds: undefined },
    }),
    /eligibility lists must be arrays/i,
  );
});
