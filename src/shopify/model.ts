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
  collectionIds: string[];
  productIds: string[];
  variantIds: string[];
  skus: string[];
  mayBeTruncated: boolean;
}

export interface PromoLabProductVariant {
  id: string;
  title: string;
  sku?: string;
}

/** The small product shape PromoLab needs for promotion eligibility tests. */
export interface PromoLabProduct {
  id: string;
  title: string;
  variants: PromoLabProductVariant[];
  variantsMayBeTruncated: boolean;
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
    !Array.isArray(discount.eligibility.collectionIds)
    || !Array.isArray(discount.eligibility.productIds)
    || !Array.isArray(discount.eligibility.variantIds)
    || !Array.isArray(discount.eligibility.skus)
  ) {
    throw new TypeError('Normalized discount eligibility lists must be arrays.');
  }
  if (typeof discount.eligibility.mayBeTruncated !== 'boolean') {
    throw new TypeError('Normalized discount eligibility requires a truncation flag.');
  }
  if (
    discount.value.kind === 'percentage'
    && (!Number.isFinite(discount.value.percentage) || discount.value.percentage <= 0)
  ) {
    throw new TypeError('Percentage discounts require a positive percentage.');
  }
}

export function assertPromoLabProduct(value: unknown): asserts value is PromoLabProduct {
  if (!value || typeof value !== 'object') {
    throw new TypeError('A normalized product must be an object.');
  }

  const product = value as Partial<PromoLabProduct>;
  if (!product.id || !product.title || !Array.isArray(product.variants)) {
    throw new TypeError('A normalized product requires id, title, and variants.');
  }
  if (typeof product.variantsMayBeTruncated !== 'boolean') {
    throw new TypeError('A normalized product requires a variant truncation flag.');
  }
  for (const variant of product.variants) {
    if (!variant.id || !variant.title) {
      throw new TypeError('A normalized product variant requires id and title.');
    }
  }
}
