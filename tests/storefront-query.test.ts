import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STOREFRONT_CART_CREATE_MUTATION,
  STOREFRONT_CART_DISCOUNT_CODES_UPDATE_MUTATION,
  STOREFRONT_CART_QUERY,
} from '../src/server/shopify/storefront/queries.ts';

test('Storefront operations cover create, code update, and 2026-07 allocation fields', () => {
  assert.match(STOREFRONT_CART_CREATE_MUTATION, /cartCreate\s*\(/);
  assert.match(STOREFRONT_CART_CREATE_MUTATION, /userErrors\s*\{[\s\S]*field[\s\S]*message[\s\S]*code/);
  assert.match(STOREFRONT_CART_CREATE_MUTATION, /warnings\s*\{[\s\S]*code[\s\S]*message[\s\S]*target/);
  assert.match(STOREFRONT_CART_CREATE_MUTATION, /lines\s*\(\s*first:\s*250\s*\)/);
  assert.match(STOREFRONT_CART_CREATE_MUTATION, /merchandise\s*\{[\s\S]*on ProductVariant[\s\S]*id[\s\S]*title/);
  assert.match(STOREFRONT_CART_CREATE_MUTATION, /cost\s*\{[\s\S]*subtotalAmount[\s\S]*totalAmount/);
  assert.match(STOREFRONT_CART_DISCOUNT_CODES_UPDATE_MUTATION, /cartDiscountCodesUpdate\s*\(/);
  assert.match(STOREFRONT_CART_QUERY, /discountCodes\s*\{[\s\S]*applicable/);
  assert.match(STOREFRONT_CART_QUERY, /discountAllocations\s*\(\s*lineLevelOnly:\s*false\s*\)/);
  assert.match(STOREFRONT_CART_QUERY, /sourceDiscountApplication/);
  assert.match(STOREFRONT_CART_QUERY, /discountApplications/);
  assert.doesNotMatch(STOREFRONT_CART_QUERY, /\bdiscountApplication\s*\{/);
});
