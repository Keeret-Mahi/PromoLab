import type {
  ShopifyDiscountNodesResponse,
  ShopifyProductsResponse,
} from '../../shopify/types.ts';

const allItems = { __typename: 'AllDiscountItems' as const, allItems: true };
const orderCombination = {
  orderDiscounts: false,
  productDiscounts: true,
  shippingDiscounts: true,
};

export const MOCK_SHOPIFY_DISCOUNTS_RESPONSE: ShopifyDiscountNodesResponse = {
  discountNodes: {
    nodes: [
      {
        id: 'gid://shopify/DiscountCodeNode/mock-welcome10',
        discount: {
          __typename: 'DiscountCodeBasic',
          title: 'Welcome offer',
          summary: '10% off order',
          status: 'ACTIVE',
          startsAt: '2026-01-01T00:00:00Z',
          endsAt: null,
          discountClasses: ['ORDER'],
          codes: { nodes: [{ code: 'WELCOME10' }] },
          combinesWith: orderCombination,
          minimumRequirement: null,
          customerGets: {
            value: { __typename: 'DiscountPercentage', percentage: 0.1 },
            items: allItems,
          },
        },
      },
      {
        id: 'gid://shopify/DiscountCodeNode/mock-summer20',
        discount: {
          __typename: 'DiscountCodeBasic',
          title: 'Summer sale',
          summary: '20% off order',
          status: 'ACTIVE',
          startsAt: '2026-06-01T00:00:00Z',
          endsAt: null,
          discountClasses: ['ORDER'],
          codes: { nodes: [{ code: 'SUMMER20' }] },
          combinesWith: {
            orderDiscounts: false,
            productDiscounts: false,
            shippingDiscounts: true,
          },
          minimumRequirement: null,
          customerGets: {
            value: { __typename: 'DiscountPercentage', percentage: 0.2 },
            items: allItems,
          },
        },
      },
      {
        id: 'gid://shopify/DiscountAutomaticNode/mock-freeship',
        discount: {
          __typename: 'DiscountAutomaticFreeShipping',
          title: 'FREESHIP',
          summary: 'Free shipping over $75',
          status: 'ACTIVE',
          startsAt: '2026-01-01T00:00:00Z',
          endsAt: null,
          discountClasses: ['SHIPPING'],
          combinesWith: {
            orderDiscounts: true,
            productDiscounts: true,
            shippingDiscounts: false,
          },
          minimumRequirement: {
            __typename: 'DiscountMinimumSubtotal',
            greaterThanOrEqualToSubtotal: { amount: '75.00', currencyCode: 'CAD' },
          },
        },
      },
      {
        id: 'gid://shopify/DiscountAutomaticNode/mock-buy2get1',
        discount: {
          __typename: 'DiscountAutomaticBxgy',
          title: 'BUY2GET1',
          summary: 'Buy 2 Classic Tees, get 1 free',
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
            value: { __typename: 'DiscountQuantity', quantity: '2' },
            items: {
              __typename: 'DiscountProducts',
              products: {
                nodes: [{ id: 'gid://shopify/Product/mock-classic-tee' }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
              productVariants: {
                nodes: [{
                  id: 'gid://shopify/ProductVariant/mock-classic-tee',
                  sku: 'TEE-CLASSIC',
                  product: { id: 'gid://shopify/Product/mock-classic-tee' },
                }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
          customerGets: {
            value: {
              __typename: 'DiscountOnQuantity',
              quantity: { quantity: '1' },
              effect: { __typename: 'DiscountPercentage', percentage: 1 },
            },
            items: allItems,
          },
        },
      },
    ],
    pageInfo: { hasNextPage: false, endCursor: null },
  },
};

export const MOCK_SHOPIFY_PRODUCTS_RESPONSE: ShopifyProductsResponse = {
  products: {
    nodes: [
      {
        id: 'gid://shopify/Product/mock-classic-tee',
        title: 'Classic Tee',
        handle: 'classic-tee',
        status: 'ACTIVE',
        tags: ['promo-eligible'],
        variants: {
          nodes: [{
            id: 'gid://shopify/ProductVariant/mock-classic-tee',
            title: 'Default',
            sku: 'TEE-CLASSIC',
            price: '30.00',
            inventoryQuantity: 100,
          }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    ],
    pageInfo: { hasNextPage: false, endCursor: null },
  },
};
