import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPromoLabDiscount } from '../src/shopify/model.ts';
import { mapShopifyDiscounts } from '../src/shopify/mapper.ts';
import { MOCK_SHOPIFY_DISCOUNTS_RESPONSE } from '../src/server/shopify/mock-data.ts';

test('accepts every mapped discount as a valid normalized model', () => {
  for (const discount of mapShopifyDiscounts(MOCK_SHOPIFY_DISCOUNTS_RESPONSE)) {
    assert.doesNotThrow(() => assertPromoLabDiscount(discount));
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
