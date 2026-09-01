import {
  assertPromoLabDiscount,
  type PromoLabDiscount,
  type PromoLabDiscountCategory,
  type PromoLabDiscountEligibility,
  type PromoLabDiscountMethod,
  type PromoLabDiscountStatus,
  type PromoLabDiscountValue,
} from './model.ts';
import type {
  ShopifyDiscount,
  ShopifyDiscountCustomerGetsValue,
  ShopifyDiscountItems,
  ShopifyDiscountNodesResponse,
  ShopifyMinimumRequirement,
} from './types.ts';

function methodFor(discount: ShopifyDiscount): PromoLabDiscountMethod {
  return discount.__typename.includes('Automatic') ? 'automatic' : 'code';
}

function codeFor(discount: ShopifyDiscount): string {
  if ('codes' in discount && discount.codes.nodes[0]?.code) {
    return discount.codes.nodes[0].code;
  }
  return discount.title.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 32);
}

function statusFor(status: ShopifyDiscount['status']): PromoLabDiscountStatus {
  return status.toLowerCase() as PromoLabDiscountStatus;
}

function categoryFor(discount: ShopifyDiscount): PromoLabDiscountCategory {
  if (discount.__typename.includes('FreeShipping')) return 'shipping';
  if (discount.__typename.includes('Bxgy')) return 'product';
  if (discount.discountClasses.includes('PRODUCT')) return 'product';
  return 'order';
}

function percentageFrom(value: ShopifyDiscountCustomerGetsValue): number | undefined {
  if (value.__typename !== 'DiscountPercentage') return undefined;
  return value.percentage <= 1 ? value.percentage * 100 : value.percentage;
}

function basicValue(value: ShopifyDiscountCustomerGetsValue): PromoLabDiscountValue {
  if (value.__typename === 'DiscountPercentage') {
    const percentage = percentageFrom(value) ?? 0;
    return { kind: 'percentage', percentage };
  }
  return {
    kind: 'fixed-amount',
    amount: Number(value.amount.amount),
    currencyCode: value.amount.currencyCode,
  };
}

function itemEligibility(items: ShopifyDiscountItems): Pick<
  PromoLabDiscountEligibility,
  'allProducts' | 'collectionIds' | 'productIds' | 'variantIds' | 'skus'
> {
  if (items.__typename === 'AllDiscountItems') {
    return {
      allProducts: items.allItems,
      collectionIds: [],
      productIds: [],
      variantIds: [],
      skus: [],
    };
  }
  if (items.__typename === 'DiscountProducts') {
    return {
      allProducts: false,
      collectionIds: [],
      productIds: [
        ...items.products.nodes.map((product) => product.id),
        ...items.productVariants.nodes.flatMap((variant) => variant.product?.id ?? []),
      ].filter((id, index, ids) => ids.indexOf(id) === index),
      variantIds: items.productVariants.nodes.map((variant) => variant.id),
      skus: items.productVariants.nodes.flatMap((variant) => variant.sku || []),
    };
  }
  return {
    allProducts: false,
    collectionIds: items.collections.nodes.map((collection) => collection.id),
    productIds: [],
    variantIds: [],
    skus: [],
  };
}

function requirementEligibility(requirement: ShopifyMinimumRequirement) {
  if (requirement?.__typename === 'DiscountMinimumSubtotal') {
    return { minimumSubtotal: Number(requirement.greaterThanOrEqualToSubtotal.amount) };
  }
  if (requirement?.__typename === 'DiscountMinimumQuantity') {
    return { minimumQuantity: Number(requirement.greaterThanOrEqualToQuantity) };
  }
  return {};
}

function normalizeDiscount(id: string, discount: ShopifyDiscount): PromoLabDiscount {
  let value: PromoLabDiscountValue = { kind: 'unknown' };
  let eligibility: PromoLabDiscountEligibility = {
    allProducts: true,
    collectionIds: [],
    productIds: [],
    variantIds: [],
    skus: [],
  };

  if (discount.__typename === 'DiscountCodeBasic' || discount.__typename === 'DiscountAutomaticBasic') {
    value = basicValue(discount.customerGets.value);
    eligibility = {
      ...eligibility,
      ...itemEligibility(discount.customerGets.items),
      ...requirementEligibility(discount.minimumRequirement),
    };
  } else if (
    discount.__typename === 'DiscountCodeFreeShipping'
    || discount.__typename === 'DiscountAutomaticFreeShipping'
  ) {
    value = { kind: 'free-shipping' };
    eligibility = { ...eligibility, ...requirementEligibility(discount.minimumRequirement) };
  } else if (discount.__typename === 'DiscountCodeBxgy' || discount.__typename === 'DiscountAutomaticBxgy') {
    value = {
      kind: 'buy-x-get-y',
      buyQuantity: Number(discount.customerBuys.value.quantity),
      getQuantity: Number(discount.customerGets.value.quantity.quantity),
      getPercentage: percentageFrom(discount.customerGets.value.effect) ?? 100,
    };
    eligibility = {
      ...eligibility,
      ...itemEligibility(discount.customerBuys.items),
      minimumQuantity:
        Number(discount.customerBuys.value.quantity)
        + Number(discount.customerGets.value.quantity.quantity),
    };
  } else {
    eligibility = { ...eligibility, allProducts: false };
  }

  const normalized: PromoLabDiscount = {
    id,
    source: 'shopify',
    sourceType: discount.__typename,
    code: codeFor(discount),
    title: discount.title,
    summary: 'summary' in discount
      ? discount.summary
      : discount.appDiscountType.description ?? discount.appDiscountType.title,
    status: statusFor(discount.status),
    category: categoryFor(discount),
    method: methodFor(discount),
    startsAt: discount.startsAt,
    endsAt: discount.endsAt ?? undefined,
    value,
    eligibility,
    combinesWith: discount.combinesWith,
  };

  assertPromoLabDiscount(normalized);
  return normalized;
}

export function mapShopifyDiscounts(
  response: ShopifyDiscountNodesResponse,
): PromoLabDiscount[] {
  return response.discountNodes.nodes.map(({ id, discount }) => normalizeDiscount(id, discount));
}
