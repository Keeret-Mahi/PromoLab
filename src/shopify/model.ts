export type PromoLabDiscountCategory = 'order' | 'shipping' | 'product';

export type PromoLabDiscountMethod = 'code' | 'automatic';

export type PromoLabDiscountStatus = 'active' | 'scheduled' | 'expired' | 'disabled';

export interface PromoLabCombinationPolicy {
  orderDiscounts: boolean;
  productDiscounts: boolean;
  shippingDiscounts: boolean;
}

export type PromoLabDiscountValue =
  | { kind: 'percentage'; percentage: number }
  | { kind: 'fixed-amount'; amount: number; currencyCode: string }
  | { kind: 'free-shipping' }
  | { kind: 'buy-x-get-y'; buyQuantity: number; getQuantity: number; getPercentage: number }
  | { kind: 'unknown' };

export interface PromoLabDiscountEligibility {
  allProducts: boolean;
  minimumSubtotal?: number;
  minimumQuantity?: number;
  productIds: string[];
  variantIds: string[];
  skus: string[];
}

/**
 * The stable discount shape consumed by PromoLab's scenario engine.
 * Shopify-specific unions and GraphQL details must be removed before this boundary.
 */
export interface PromoLabDiscount {
  id: string;
  source: 'mock' | 'shopify';
  sourceType: string;
  code: string;
  title: string;
  summary: string;
  status: PromoLabDiscountStatus;
  category: PromoLabDiscountCategory;
  method: PromoLabDiscountMethod;
  startsAt?: string;
  endsAt?: string;
  value: PromoLabDiscountValue;
  eligibility: PromoLabDiscountEligibility;
  combinesWith: PromoLabCombinationPolicy;
}

export function assertPromoLabDiscount(value: unknown): asserts value is PromoLabDiscount {
  if (!value || typeof value !== 'object') {
    throw new TypeError('A normalized discount must be an object.');
  }

  const discount = value as Partial<PromoLabDiscount>;
  if (!discount.id || !discount.code || !discount.title) {
    throw new TypeError('A normalized discount requires id, code, and title.');
  }
  if (!['mock', 'shopify'].includes(discount.source ?? '')) {
    throw new TypeError('A normalized discount requires a supported source.');
  }
  if (!['order', 'shipping', 'product'].includes(discount.category ?? '')) {
    throw new TypeError('A normalized discount requires a supported category.');
  }
  if (!['code', 'automatic'].includes(discount.method ?? '')) {
    throw new TypeError('A normalized discount requires a supported method.');
  }
  if (!discount.value || !discount.eligibility || !discount.combinesWith) {
    throw new TypeError('A normalized discount requires value, eligibility, and combination policy.');
  }
  if (
    discount.value.kind === 'percentage'
    && (!Number.isFinite(discount.value.percentage) || discount.value.percentage <= 0)
  ) {
    throw new TypeError('Percentage discounts require a positive percentage.');
  }
}
