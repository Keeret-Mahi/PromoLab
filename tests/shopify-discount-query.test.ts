import assert from 'node:assert/strict';
import test from 'node:test';
import { DISCOUNT_NODES_QUERY } from '../src/server/shopify/queries/discount-nodes.ts';

test('discount query selects every customer-gets union subtype through inline fragments', () => {
  assert.match(DISCOUNT_NODES_QUERY, /fragment DiscountCustomerGetsValueFields on DiscountCustomerGetsValue/);
  assert.match(DISCOUNT_NODES_QUERY, /\.\.\. on DiscountPercentage \{ percentage \}/);
  assert.match(DISCOUNT_NODES_QUERY, /\.\.\. on DiscountAmount \{/);
  assert.match(DISCOUNT_NODES_QUERY, /\.\.\. on DiscountOnQuantity \{/);
  assert.match(DISCOUNT_NODES_QUERY, /effect \{ \.\.\.DiscountEffectFields \}/);
});

test('discount query selects every customer-buys union subtype through inline fragments', () => {
  assert.match(DISCOUNT_NODES_QUERY, /fragment DiscountCustomerBuysValueFields on DiscountCustomerBuysValue/);
  assert.match(DISCOUNT_NODES_QUERY, /\.\.\. on DiscountQuantity \{ quantity \}/);
  assert.match(DISCOUNT_NODES_QUERY, /\.\.\. on DiscountPurchaseAmount \{ amount \}/);
});

test('BXGY fragments do not select fields directly from either value union', () => {
  const compactQuery = DISCOUNT_NODES_QUERY.replace(/\s+/g, ' ');

  assert.doesNotMatch(compactQuery, /customerBuys \{ value \{ quantity/);
  assert.doesNotMatch(compactQuery, /customerGets \{ value \{ quantity/);
  assert.equal(
    compactQuery.match(/value \{ \.\.\.DiscountCustomerBuysValueFields \}/g)?.length,
    2,
  );
  assert.equal(
    compactQuery.match(/value \{ \.\.\.DiscountCustomerGetsValueFields \}/g)?.length,
    4,
  );
});
