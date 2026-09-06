import {
  assertPromoLabDiscount,
  assertPromoLabProduct,
  type PromoLabDiscount,
  type PromoLabDiscountCategory,
  type PromoLabDiscountEligibility,
  type PromoLabDiscountMethod,
  type PromoLabDiscountStatus,
  type PromoLabDiscountValue,
  type PromoLabProduct,
} from './model.ts';
import type {
  ShopifyDiscount,
  ShopifyDiscountCustomerGetsValue,
  ShopifyDiscountEffect,
  ShopifyDiscountItems,
  ShopifyDiscountNodesResponse,
  ShopifyMinimumRequirement,
  ShopifyProductsResponse,
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

function percentageFrom(value: ShopifyDiscountEffect): number | undefined {
  if (value.__typename !== 'DiscountPercentage') return undefined;
  return value.percentage <= 1 ? value.percentage * 100 : value.percentage;
}

function effectValue(value: ShopifyDiscountEffect): PromoLabDiscountValue {
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

function basicValue(value: ShopifyDiscountCustomerGetsValue): PromoLabDiscountValue {
  return effectValue(value.__typename === 'DiscountOnQuantity' ? value.effect : value);
}

function itemEligibility(items: ShopifyDiscountItems): Pick<
  PromoLabDiscountEligibility,
  'allProducts' | 'collectionIds' | 'productIds' | 'variantIds' | 'skus' | 'mayBeTruncated'
> {
  if (items.__typename === 'AllDiscountItems') {
    return {
      allProducts: items.allItems,
      collectionIds: [],
      productIds: [],
      variantIds: [],
      skus: [],
      mayBeTruncated: false,
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
      mayBeTruncated:
        items.products.pageInfo.hasNextPage
        || items.productVariants.pageInfo.hasNextPage,
    };
  }
  return {
    allProducts: false,
    collectionIds: items.collections.nodes.map((collection) => collection.id),
    productIds: [],
    variantIds: [],
    skus: [],
    mayBeTruncated: items.collections.pageInfo.hasNextPage,
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
    mayBeTruncated: false,
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
    const customerBuysEligibility = itemEligibility(discount.customerBuys.items);
    const customerGetsEligibility = itemEligibility(discount.customerGets.items);
    const customerBuysValue = discount.customerBuys.value;
    const customerGetsValue = discount.customerGets.value;
    const getQuantity = customerGetsValue.__typename === 'DiscountOnQuantity'
      ? Number(customerGetsValue.quantity.quantity)
      : 1;
    const getEffect = customerGetsValue.__typename === 'DiscountOnQuantity'
      ? customerGetsValue.effect
      : customerGetsValue;
    const buyQuantity = customerBuysValue.__typename === 'DiscountQuantity'
      ? Number(customerBuysValue.quantity)
      : undefined;
    const buyAmount = customerBuysValue.__typename === 'DiscountPurchaseAmount'
      ? Number(customerBuysValue.amount)
      : undefined;
    value = {
      kind: 'buy-x-get-y',
      ...(buyQuantity === undefined ? {} : { buyQuantity }),
      ...(buyAmount === undefined ? {} : { buyAmount }),
      getQuantity,
      ...(getEffect.__typename === 'DiscountPercentage'
        ? { getPercentage: percentageFrom(getEffect) ?? 100 }
        : {
            getAmount: Number(getEffect.amount.amount),
            currencyCode: getEffect.amount.currencyCode,
          }),
    };
    eligibility = {
      ...eligibility,
      ...customerBuysEligibility,
      ...(buyQuantity === undefined ? {} : { minimumQuantity: buyQuantity + getQuantity }),
      ...(buyAmount === undefined ? {} : { minimumSubtotal: buyAmount }),
      mayBeTruncated:
        customerBuysEligibility.mayBeTruncated
        || customerGetsEligibility.mayBeTruncated,
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

export function mapShopifyProducts(
  response: ShopifyProductsResponse,
): PromoLabProduct[] {
  return response.products.nodes.map((product) => {
    const normalized: PromoLabProduct = {
      id: product.id,
      title: product.title,
      variants: product.variants.nodes.map((variant) => ({
        id: variant.id,
        title: variant.title,
        ...(variant.sku ? { sku: variant.sku } : {}),
        price: Number(variant.price),
      })),
      variantsMayBeTruncated: product.variants.pageInfo.hasNextPage,
    };
    assertPromoLabProduct(normalized);
    return normalized;
  });
}
