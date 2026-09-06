export const STOREFRONT_CART_CREATE_MUTATION = /* GraphQL */ `
  mutation PromoLabCartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart {
        id
        lines(first: 250) {
          nodes {
            id
            quantity
            merchandise {
              __typename
              ... on ProductVariant {
                id
                title
              }
            }
          }
        }
        cost {
          subtotalAmount {
            amount
            currencyCode
          }
          totalAmount {
            amount
            currencyCode
          }
        }
      }
      userErrors {
        field
        message
        code
      }
      warnings {
        code
        message
        target
      }
    }
  }
`;

export const STOREFRONT_CART_DISCOUNT_CODES_UPDATE_MUTATION = /* GraphQL */ `
  mutation PromoLabCartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]!) {
    cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
      cart {
        id
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export const STOREFRONT_CART_QUERY = /* GraphQL */ `
  fragment PromoLabMoney on MoneyV2 {
    amount
    currencyCode
  }

  fragment PromoLabDiscountApplication on BaseCartDiscountApplication {
    __typename
    targetType
    targetSelection
    totalAllocatedAmount {
      ...PromoLabMoney
    }
    ... on CartCodeDiscountApplication {
      code
    }
    ... on CartAutomaticDiscountApplication {
      title
    }
    ... on CartCustomDiscountApplication {
      title
    }
  }

  query PromoLabCart($cartId: ID!) {
    cart(id: $cartId) {
      id
      discountCodes {
        code
        applicable
      }
      discountApplications {
        ...PromoLabDiscountApplication
      }
      cost {
        subtotalAmount {
          ...PromoLabMoney
        }
        totalAmount {
          ...PromoLabMoney
        }
      }
      lines(first: 250) {
        nodes {
          id
          quantity
          merchandise {
            __typename
            ... on ProductVariant {
              id
              title
              sku
            }
          }
          cost {
            subtotalAmount {
              ...PromoLabMoney
            }
            totalAmount {
              ...PromoLabMoney
            }
          }
          discountAllocations(lineLevelOnly: false) {
            __typename
            discountedAmount {
              ...PromoLabMoney
            }
            targetType
            sourceDiscountApplication {
              ...PromoLabDiscountApplication
            }
          }
        }
      }
    }
  }
`;
