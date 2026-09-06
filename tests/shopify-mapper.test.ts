import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mapShopifyDiscounts,
  mapShopifyProducts,
} from '../src/shopify/mapper.ts';
import {
  MOCK_SHOPIFY_DISCOUNTS_RESPONSE,
  MOCK_SHOPIFY_PRODUCTS_RESPONSE,
} from '../src/server/shopify/mock-data.ts';
import type { ShopifyDiscountNodesResponse } from '../src/shopify/types.ts';

const completePage = { hasNextPage: false, endCursor: null };

function responseWithDiscount(
  discount: ShopifyDiscountNodesResponse['discountNodes']['nodes'][number]['discount'],
): ShopifyDiscountNodesResponse {
  return {
    discountNodes: {
      nodes: [{ id: `gid://shopify/DiscountNode/${discount.__typename}`, discount }],
      pageInfo: completePage,
    },
  };
}

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

test('preserves all three Shopify combination flags', () => {
  const [welcome] = mapShopifyDiscounts(MOCK_SHOPIFY_DISCOUNTS_RESPONSE);

  assert.deepEqual(welcome?.combinesWith, {
    orderDiscounts: false,
    productDiscounts: true,
    shippingDiscounts: true,
  });
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
    collections: {
      nodes: [{ id: 'gid://shopify/Collection/sale' }],
      pageInfo: completePage,
    },
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

test('maps DiscountPercentage from DiscountCustomerGetsValue on an automatic discount', () => {
  const [discount] = mapShopifyDiscounts(responseWithDiscount({
    __typename: 'DiscountAutomaticBasic',
    title: 'Automatic 15%',
    summary: '15% off eligible products',
    status: 'ACTIVE',
    startsAt: '2026-01-01T00:00:00Z',
    endsAt: null,
    discountClasses: ['PRODUCT'],
    combinesWith: {
      orderDiscounts: true,
      productDiscounts: false,
      shippingDiscounts: true,
    },
    minimumRequirement: null,
    customerGets: {
      value: { __typename: 'DiscountPercentage', percentage: 0.15 },
      items: { __typename: 'AllDiscountItems', allItems: true },
    },
  }));

  assert.equal(discount?.method, 'automatic');
  assert.equal(discount?.category, 'product');
  assert.deepEqual(discount?.value, { kind: 'percentage', percentage: 15 });
  assert.deepEqual(discount?.combinesWith, {
    orderDiscounts: true,
    productDiscounts: false,
    shippingDiscounts: true,
  });
});

test('maps DiscountAmount from DiscountCustomerGetsValue on a code discount', () => {
  const [discount] = mapShopifyDiscounts(responseWithDiscount({
    __typename: 'DiscountCodeBasic',
    title: 'Twenty dollars off',
    summary: '$20 off the order',
    status: 'ACTIVE',
    startsAt: '2026-01-01T00:00:00Z',
    endsAt: null,
    discountClasses: ['ORDER'],
    codes: { nodes: [{ code: 'TAKE20' }] },
    combinesWith: {
      orderDiscounts: false,
      productDiscounts: true,
      shippingDiscounts: true,
    },
    minimumRequirement: null,
    customerGets: {
      value: {
        __typename: 'DiscountAmount',
        amount: { amount: '20.00', currencyCode: 'CAD' },
        appliesOnEachItem: false,
      },
      items: { __typename: 'AllDiscountItems', allItems: true },
    },
  }));

  assert.equal(discount?.method, 'code');
  assert.deepEqual(discount?.value, {
    kind: 'fixed-amount',
    amount: 20,
    currencyCode: 'CAD',
  });
});

test('maps DiscountCodeFreeShipping', () => {
  const [discount] = mapShopifyDiscounts(responseWithDiscount({
    __typename: 'DiscountCodeFreeShipping',
    title: 'Ship free',
    summary: 'Free shipping over $50',
    status: 'ACTIVE',
    startsAt: '2026-01-01T00:00:00Z',
    endsAt: null,
    discountClasses: ['SHIPPING'],
    codes: { nodes: [{ code: 'SHIPFREE' }] },
    combinesWith: {
      orderDiscounts: true,
      productDiscounts: true,
      shippingDiscounts: false,
    },
    minimumRequirement: {
      __typename: 'DiscountMinimumSubtotal',
      greaterThanOrEqualToSubtotal: { amount: '50.00', currencyCode: 'CAD' },
    },
  }));

  assert.equal(discount?.code, 'SHIPFREE');
  assert.equal(discount?.category, 'shipping');
  assert.deepEqual(discount?.value, { kind: 'free-shipping' });
  assert.equal(discount?.eligibility.minimumSubtotal, 50);
});

test('maps DiscountQuantity and DiscountOnQuantity for a code BXGY discount', () => {
  const [discount] = mapShopifyDiscounts(responseWithDiscount({
    __typename: 'DiscountCodeBxgy',
    title: 'Buy two get one',
    summary: 'Buy two, get one free',
    status: 'ACTIVE',
    startsAt: '2026-01-01T00:00:00Z',
    endsAt: null,
    discountClasses: ['PRODUCT'],
    codes: { nodes: [{ code: 'B2G1' }] },
    combinesWith: {
      orderDiscounts: false,
      productDiscounts: false,
      shippingDiscounts: true,
    },
    customerBuys: {
      value: { __typename: 'DiscountQuantity', quantity: '2' },
      items: {
        __typename: 'DiscountProducts',
        products: {
          nodes: [{ id: 'gid://shopify/Product/one' }],
          pageInfo: completePage,
        },
        productVariants: {
          nodes: [],
          pageInfo: completePage,
        },
      },
    },
    customerGets: {
      value: {
        __typename: 'DiscountOnQuantity',
        quantity: { quantity: '1' },
        effect: { __typename: 'DiscountPercentage', percentage: 1 },
      },
      items: {
        __typename: 'DiscountCollections',
        collections: {
          nodes: [],
          pageInfo: { hasNextPage: true, endCursor: 'more-collections' },
        },
      },
    },
  }));

  assert.equal(discount?.code, 'B2G1');
  assert.deepEqual(discount?.value, {
    kind: 'buy-x-get-y',
    buyQuantity: 2,
    getQuantity: 1,
    getPercentage: 100,
  });
  assert.equal(discount?.eligibility.minimumQuantity, 3);
  assert.equal(discount?.eligibility.mayBeTruncated, true);
});

test('maps DiscountPurchaseAmount and a fixed DiscountOnQuantity effect', () => {
  const [discount] = mapShopifyDiscounts(responseWithDiscount({
    __typename: 'DiscountAutomaticBxgy',
    title: 'Spend 100 get 20',
    summary: 'Spend $100 and get $20 off one item',
    status: 'ACTIVE',
    startsAt: '2026-01-01T00:00:00Z',
    endsAt: null,
    discountClasses: ['PRODUCT'],
    combinesWith: {
      orderDiscounts: false,
      productDiscounts: false,
      shippingDiscounts: true,
    },
    customerBuys: {
      value: { __typename: 'DiscountPurchaseAmount', amount: '100.00' },
      items: { __typename: 'AllDiscountItems', allItems: true },
    },
    customerGets: {
      value: {
        __typename: 'DiscountOnQuantity',
        quantity: { quantity: '1' },
        effect: {
          __typename: 'DiscountAmount',
          amount: { amount: '20.00', currencyCode: 'CAD' },
          appliesOnEachItem: true,
        },
      },
      items: { __typename: 'AllDiscountItems', allItems: true },
    },
  }));

  assert.equal(discount?.method, 'automatic');
  assert.deepEqual(discount?.value, {
    kind: 'buy-x-get-y',
    buyAmount: 100,
    getQuantity: 1,
    getAmount: 20,
    currencyCode: 'CAD',
  });
  assert.equal(discount?.eligibility.minimumSubtotal, 100);
  assert.equal(discount?.eligibility.minimumQuantity, undefined);
});

test('normalizes products and exposes variant truncation', () => {
  const response = structuredClone(MOCK_SHOPIFY_PRODUCTS_RESPONSE);
  const product = response.products.nodes[0];
  assert.ok(product);
  product.variants.nodes.push({
    id: 'gid://shopify/ProductVariant/no-sku',
    title: 'No SKU',
    sku: null,
    price: '30.00',
    inventoryQuantity: null,
  });
  product.variants.pageInfo = { hasNextPage: true, endCursor: 'variant-100' };

  const [normalized] = mapShopifyProducts(response);
  assert.deepEqual(normalized, {
    id: 'gid://shopify/Product/mock-classic-tee',
    title: 'Classic Tee',
    variants: [
      {
        id: 'gid://shopify/ProductVariant/mock-classic-tee',
        title: 'Default',
        sku: 'TEE-CLASSIC',
        price: 30,
      },
      {
        id: 'gid://shopify/ProductVariant/no-sku',
        title: 'No SKU',
        price: 30,
      },
    ],
    variantsMayBeTruncated: true,
  });
});
