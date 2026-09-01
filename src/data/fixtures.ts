import type { CartFixture, Discount, ExpectedPromotion } from '../domain/types.ts';

export const DEFAULT_PROMPT =
  'Summer Sale should give customers 20% off, but it must not stack with WELCOME10. Free shipping should still apply on orders over $75. Buy 2 Get 1 should work independently.';

export const SAMPLE_DISCOUNTS: Discount[] = [
  {
    code: 'WELCOME10',
    title: 'Welcome offer',
    category: 'order',
    method: 'code',
    valueLabel: '10% off order',
    percentage: 10,
    combinesWith: {
      orderDiscounts: false,
      productDiscounts: true,
      shippingDiscounts: true,
    },
  },
  {
    code: 'SUMMER20',
    title: 'Summer sale',
    category: 'order',
    method: 'code',
    valueLabel: '20% off order',
    percentage: 20,
    combinesWith: {
      orderDiscounts: false,
      productDiscounts: false,
      shippingDiscounts: true,
    },
  },
  {
    code: 'FREESHIP',
    title: 'Free shipping over $75',
    category: 'shipping',
    method: 'automatic',
    valueLabel: '$75 minimum',
    minimumSubtotal: 75,
    combinesWith: {
      orderDiscounts: true,
      productDiscounts: true,
      shippingDiscounts: false,
    },
  },
  {
    code: 'BUY2GET1',
    title: 'Buy 2 Classic Tees, get 1 free',
    category: 'product',
    method: 'automatic',
    valueLabel: '1 item free',
    eligibleSku: 'TEE-CLASSIC',
    requiredQuantity: 3,
    freeQuantity: 1,
    combinesWith: {
      orderDiscounts: false,
      productDiscounts: false,
      shippingDiscounts: true,
    },
  },
];

export const SAMPLE_CARTS: CartFixture[] = [
  {
    id: 'starter-cart',
    name: 'Starter cart',
    description: 'One Classic Tee',
    lines: [{ sku: 'TEE-CLASSIC', title: 'Classic Tee', quantity: 1, unitPrice: 30 }],
    shippingPrice: 8,
  },
  {
    id: 'threshold-cart',
    name: 'Threshold cart',
    description: '$80 before discounts',
    lines: [
      { sku: 'TEE-CLASSIC', title: 'Classic Tee', quantity: 1, unitPrice: 30 },
      { sku: 'CAP-CANVAS', title: 'Canvas Cap', quantity: 1, unitPrice: 50 },
    ],
    shippingPrice: 10,
  },
  {
    id: 'tee-trio',
    name: 'Tee trio',
    description: '3 eligible Classic Tees',
    lines: [{ sku: 'TEE-CLASSIC', title: 'Classic Tee', quantity: 3, unitPrice: 30 }],
    shippingPrice: 10,
  },
  {
    id: 'large-mixed-cart',
    name: 'Large mixed cart',
    description: '$140 mixed merchandise',
    lines: [
      { sku: 'JKT-LIGHT', title: 'Light Jacket', quantity: 1, unitPrice: 95 },
      { sku: 'CAP-CANVAS', title: 'Canvas Cap', quantity: 1, unitPrice: 45 },
    ],
    shippingPrice: 12,
  },
];

export const DEFAULT_EXPECTATIONS: ExpectedPromotion = {
  name: 'Summer Sale preflight',
  summary: '20% summer pricing with explicit stacking, shipping, and BOGO rules.',
  parser: 'mock-llm',
  confidence: 0.96,
  rules: [
    {
      id: 'summer-value',
      kind: 'discount-value',
      title: 'Summer discount',
      statement: 'SUMMER20 applies 20% off the merchandise subtotal.',
      sourceText: 'Summer Sale should give customers 20% off',
      discountCodes: ['SUMMER20'],
      value: 20,
    },
    {
      id: 'order-exclusion',
      kind: 'incompatibility',
      title: 'Order codes do not stack',
      statement: 'WELCOME10 and SUMMER20 are mutually exclusive; keep the larger saving.',
      sourceText: 'it must not stack with WELCOME10',
      discountCodes: ['WELCOME10', 'SUMMER20'],
      resolution: 'best-discount',
    },
    {
      id: 'shipping-threshold',
      kind: 'threshold',
      title: 'Shipping remains eligible',
      statement: 'FREESHIP applies when the pre-discount merchandise subtotal is at least $75.',
      sourceText: 'Free shipping should still apply on orders over $75',
      discountCodes: ['FREESHIP'],
      threshold: 75,
    },
    {
      id: 'bogo-independence',
      kind: 'independence',
      title: 'BOGO is independent',
      statement: 'BUY2GET1 may combine with order and shipping discounts when the cart is eligible.',
      sourceText: 'Buy 2 Get 1 should work independently',
      discountCodes: ['BUY2GET1'],
    },
  ],
};

export function getCartSubtotal(cart: CartFixture): number {
  return cart.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
}
