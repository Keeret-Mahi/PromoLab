import assert from 'node:assert/strict';
import test from 'node:test';
import { generateLiveStorefrontScenarios } from '../src/engine/live-storefront-scenarios.ts';
import { mapShopifyDiscounts } from '../src/shopify/mapper.ts';
import { MOCK_SHOPIFY_DISCOUNTS_RESPONSE } from '../src/server/shopify/mock-data.ts';

test('live scenarios use a fetched eligible TechNest ProductVariant GID', () => {
  const discounts = mapShopifyDiscounts(MOCK_SHOPIFY_DISCOUNTS_RESPONSE);
  const summer = discounts.find((discount) => discount.code === 'SUMMER20');
  assert.ok(summer);
  summer.eligibility = {
    ...summer.eligibility,
    allProducts: false,
    productIds: ['gid://shopify/Product/technest'],
  };

  const scenarios = generateLiveStorefrontScenarios(discounts, [
    {
      id: 'gid://shopify/Product/other',
      title: 'Other product',
      variants: [{
        id: 'gid://shopify/ProductVariant/other',
        title: 'Default',
        price: 10,
      }],
      variantsMayBeTruncated: false,
    },
    {
      id: 'gid://shopify/Product/technest',
      title: 'TechNest Keyboard',
      variants: [{
        id: 'gid://shopify/ProductVariant/technest-keyboard',
        title: 'Black',
        sku: 'TECH-KEY-BLK',
        price: 125,
      }],
      variantsMayBeTruncated: false,
    },
  ]);

  assert.deepEqual(scenarios.map((scenario) => scenario.discountCodes), [
    ['SUMMER20'],
    ['WELCOME10'],
    ['SUMMER20', 'WELCOME10'],
  ]);
  assert.equal(scenarios.length, 3);
  assert.ok(scenarios.every(
    (scenario) => scenario.cart.lines[0]?.merchandiseId
      === 'gid://shopify/ProductVariant/technest-keyboard',
  ));
  assert.ok(scenarios.every((scenario) => scenario.cart.lines[0]?.unitPrice === 125));
});

test('live scenario generation fails instead of substituting fabricated merchandise', () => {
  const discounts = mapShopifyDiscounts(MOCK_SHOPIFY_DISCOUNTS_RESPONSE);
  const summer = discounts.find((discount) => discount.code === 'SUMMER20');
  assert.ok(summer);
  summer.eligibility = {
    ...summer.eligibility,
    allProducts: false,
    productIds: ['gid://shopify/Product/not-fetched'],
  };

  assert.throws(
    () => generateLiveStorefrontScenarios(discounts, []),
    /No fetched Shopify product variant is known to be eligible for SUMMER20/i,
  );
});
