import type { CartFixture, ExpectedPromotion } from '../domain/types.ts';

export const DEFAULT_PROMPT =
  'SUMMER20 should give 20% off eligible products. It must not stack with WELCOME10; when both are attempted on the same eligible cart, only the better applicable discount should remain.';

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
  summary: '20% off eligible products with explicit SUMMER20 and WELCOME10 incompatibility.',
  parser: 'mock-llm',
  confidence: 0.96,
  rules: [
    {
      id: 'summer-value',
      kind: 'discount-value',
      title: 'Summer discount',
      statement: 'SUMMER20 applies 20% off eligible products.',
      sourceText: 'SUMMER20 should give 20% off eligible products',
      discountCodes: ['SUMMER20'],
      value: 20,
    },
    {
      id: 'order-exclusion',
      kind: 'incompatibility',
      title: 'Discount incompatibility',
      statement: 'SUMMER20 and WELCOME10 should not stack; only the better applicable discount should remain.',
      sourceText: 'It must not stack with WELCOME10; when both are attempted on the same eligible cart, only the better applicable discount should remain',
      discountCodes: ['SUMMER20', 'WELCOME10'],
      resolution: 'best-discount',
    },
  ],
};

export function getCartSubtotal(cart: CartFixture): number {
  return cart.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
}
