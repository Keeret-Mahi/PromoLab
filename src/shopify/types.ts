export type ShopifyDiscountStatus = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'DISABLED';

export interface ShopifyMoneyV2 {
  amount: string;
  currencyCode: string;
}

export interface ShopifyPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface ShopifyDiscountCombinesWith {
  orderDiscounts: boolean;
  productDiscounts: boolean;
  shippingDiscounts: boolean;
}

export type ShopifyMinimumRequirement =
  | {
      __typename: 'DiscountMinimumSubtotal';
      greaterThanOrEqualToSubtotal: ShopifyMoneyV2;
    }
  | {
      __typename: 'DiscountMinimumQuantity';
      greaterThanOrEqualToQuantity: string;
    }
  | null;

export interface ShopifyProductReference {
  id: string;
}

export interface ShopifyVariantReference {
  id: string;
  sku?: string | null;
  product?: { id: string } | null;
}

export type ShopifyDiscountItems =
  | { __typename: 'AllDiscountItems'; allItems: boolean }
  | {
      __typename: 'DiscountProducts';
      products: { nodes: ShopifyProductReference[] };
      productVariants: { nodes: ShopifyVariantReference[] };
    }
  | {
      __typename: 'DiscountCollections';
      collections: { nodes: Array<{ id: string }> };
    };

export type ShopifyDiscountCustomerGetsValue =
  | { __typename: 'DiscountPercentage'; percentage: number }
  | { __typename: 'DiscountAmount'; amount: ShopifyMoneyV2; appliesOnEachItem: boolean };

export interface ShopifyDiscountBase {
  __typename: string;
  title: string;
  summary: string;
  status: ShopifyDiscountStatus;
  startsAt: string;
  endsAt: string | null;
  discountClasses: Array<'ORDER' | 'PRODUCT' | 'SHIPPING'>;
  combinesWith: ShopifyDiscountCombinesWith;
}

export interface ShopifyCodeDiscountBase extends ShopifyDiscountBase {
  codes: { nodes: Array<{ code: string }> };
}

export interface ShopifyDiscountCodeBasic extends ShopifyCodeDiscountBase {
  __typename: 'DiscountCodeBasic';
  customerGets: {
    value: ShopifyDiscountCustomerGetsValue;
    items: ShopifyDiscountItems;
  };
  minimumRequirement: ShopifyMinimumRequirement;
}

export interface ShopifyDiscountAutomaticBasic extends ShopifyDiscountBase {
  __typename: 'DiscountAutomaticBasic';
  customerGets: {
    value: ShopifyDiscountCustomerGetsValue;
    items: ShopifyDiscountItems;
  };
  minimumRequirement: ShopifyMinimumRequirement;
}

export interface ShopifyDiscountCodeFreeShipping extends ShopifyCodeDiscountBase {
  __typename: 'DiscountCodeFreeShipping';
  minimumRequirement: ShopifyMinimumRequirement;
}

export interface ShopifyDiscountAutomaticFreeShipping extends ShopifyDiscountBase {
  __typename: 'DiscountAutomaticFreeShipping';
  minimumRequirement: ShopifyMinimumRequirement;
}

export interface ShopifyBxgyCustomerGets {
  value: {
    quantity: { quantity: string };
    effect: ShopifyDiscountCustomerGetsValue;
  };
  items: ShopifyDiscountItems;
}

export interface ShopifyBxgyCustomerBuys {
  value: { quantity: string };
  items: ShopifyDiscountItems;
}

export interface ShopifyDiscountCodeBxgy extends ShopifyCodeDiscountBase {
  __typename: 'DiscountCodeBxgy';
  customerBuys: ShopifyBxgyCustomerBuys;
  customerGets: ShopifyBxgyCustomerGets;
}

export interface ShopifyDiscountAutomaticBxgy extends ShopifyDiscountBase {
  __typename: 'DiscountAutomaticBxgy';
  customerBuys: ShopifyBxgyCustomerBuys;
  customerGets: ShopifyBxgyCustomerGets;
}

export interface ShopifyAppDiscountType {
  title: string;
  description: string | null;
}

export interface ShopifyDiscountCodeApp extends Omit<ShopifyDiscountBase, 'summary'> {
  __typename: 'DiscountCodeApp';
  codes: { nodes: Array<{ code: string }> };
  appDiscountType: ShopifyAppDiscountType;
}

export interface ShopifyDiscountAutomaticApp extends Omit<ShopifyDiscountBase, 'summary'> {
  __typename: 'DiscountAutomaticApp';
  appDiscountType: ShopifyAppDiscountType;
}

export type ShopifyDiscount =
  | ShopifyDiscountCodeBasic
  | ShopifyDiscountAutomaticBasic
  | ShopifyDiscountCodeFreeShipping
  | ShopifyDiscountAutomaticFreeShipping
  | ShopifyDiscountCodeBxgy
  | ShopifyDiscountAutomaticBxgy
  | ShopifyDiscountCodeApp
  | ShopifyDiscountAutomaticApp;

export interface ShopifyDiscountNodesResponse {
  discountNodes: {
    nodes: Array<{ id: string; discount: ShopifyDiscount }>;
    pageInfo: ShopifyPageInfo;
  };
}

export interface ShopifyProductVariant {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  inventoryQuantity: number | null;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT' | 'UNLISTED';
  tags: string[];
  variants: { nodes: ShopifyProductVariant[] };
}

export interface ShopifyProductsResponse {
  products: {
    nodes: ShopifyProduct[];
    pageInfo: ShopifyPageInfo;
  };
}

export interface ShopifyGraphQLError {
  message: string;
  path?: Array<string | number>;
  extensions?: {
    code?: string;
    [key: string]: unknown;
  };
}

export interface ShopifyGraphQLCostExtensions {
  requestedQueryCost?: number;
  actualQueryCost?: number;
  throttleStatus?: {
    maximumAvailable: number;
    currentlyAvailable: number;
    restoreRate: number;
  };
}

export interface ShopifyGraphQLResponse<T> {
  data?: T;
  errors?: ShopifyGraphQLError[];
  extensions?: {
    cost?: ShopifyGraphQLCostExtensions;
    [key: string]: unknown;
  };
}
