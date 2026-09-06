import assert from 'node:assert/strict';
import test from 'node:test';
import { MockShopifyService } from '../src/server/shopify/mock-service.ts';

test('MockShopifyService supplies cloned mock data and normalized models without credentials', async () => {
  const service = new MockShopifyService();
  const firstResponse = await service.queryDiscounts();
  firstResponse.discountNodes.nodes.splice(0);

  const secondResponse = await service.queryDiscounts();
  const discounts = await service.getActiveDiscounts();
  const products = await service.getProductsForEligibility();

  assert.equal(service.mode, 'mock');
  assert.equal(secondResponse.discountNodes.nodes.length, 4);
  assert.deepEqual(discounts.map((discount) => discount.code), [
    'WELCOME10',
    'SUMMER20',
    'FREESHIP',
    'BUY2GET1',
  ]);
  assert.ok(discounts.every((discount) => discount.source === 'mock'));
  assert.deepEqual(products, [{
    id: 'gid://shopify/Product/mock-classic-tee',
    title: 'Classic Tee',
    variants: [{
      id: 'gid://shopify/ProductVariant/mock-classic-tee',
      title: 'Default',
      sku: 'TEE-CLASSIC',
      price: 30,
    }],
    variantsMayBeTruncated: false,
  }]);
});
