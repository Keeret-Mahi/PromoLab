export interface StorefrontMoney {
  amount: string;
  currencyCode: string;
}

export interface StorefrontUserError {
  field: string[] | null;
  message: string;
  code: string | null;
}

export interface StorefrontCartWarning {
  code: string;
  message: string;
  target: string;
}

export interface StorefrontDiscountApplication {
  __typename: string;
  targetType: string;
  targetSelection: string;
  totalAllocatedAmount: StorefrontMoney;
  code?: string;
  title?: string;
}

export interface StorefrontDiscountAllocation {
  __typename: string;
  discountedAmount: StorefrontMoney;
  targetType: string;
  sourceDiscountApplication: StorefrontDiscountApplication;
}

export interface StorefrontCartLine {
  id: string;
  quantity: number;
  merchandise: {
    __typename: string;
    id?: string;
    title?: string;
    sku?: string | null;
  };
  cost: {
    subtotalAmount: StorefrontMoney;
    totalAmount: StorefrontMoney;
  };
  discountAllocations: StorefrontDiscountAllocation[];
}

export interface StorefrontCart {
  id: string;
  discountCodes: Array<{ code: string; applicable: boolean }>;
  discountApplications: StorefrontDiscountApplication[];
  cost: {
    subtotalAmount: StorefrontMoney;
    totalAmount: StorefrontMoney;
  };
  lines: {
    nodes: StorefrontCartLine[];
  };
}

export interface StorefrontGraphQLError {
  message: string;
  path?: Array<string | number>;
  extensions?: {
    code?: string;
    [key: string]: unknown;
  };
}

export interface StorefrontGraphQLResponse<T> {
  data?: T;
  errors?: StorefrontGraphQLError[];
}

export interface StorefrontCartCreateData {
  cartCreate: {
    cart: {
      id: string;
      lines: {
        nodes: Array<{
          id: string;
          quantity: number;
          merchandise: {
            __typename: string;
            id?: string;
            title?: string;
          };
        }>;
      };
      cost: {
        subtotalAmount: StorefrontMoney;
        totalAmount: StorefrontMoney;
      };
    } | null;
    userErrors: StorefrontUserError[];
    warnings: StorefrontCartWarning[];
  };
}

export interface StorefrontCartDiscountCodesUpdateData {
  cartDiscountCodesUpdate: {
    cart: { id: string } | null;
    userErrors: StorefrontUserError[];
  };
}

export interface StorefrontCartQueryData {
  cart: StorefrontCart | null;
}
