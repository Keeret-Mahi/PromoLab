export const DISCOUNT_NODES_QUERY = /* GraphQL */ `
  query PromoLabDiscountNodes($first: Int!, $after: String, $query: String) {
    discountNodes(first: $first, after: $after, query: $query) {
      nodes {
        id
        discount {
          __typename
          ...DiscountCodeBasicFields
          ...DiscountAutomaticBasicFields
          ...DiscountCodeFreeShippingFields
          ...DiscountAutomaticFreeShippingFields
          ...DiscountCodeBxgyFields
          ...DiscountAutomaticBxgyFields
          ...DiscountCodeAppFields
          ...DiscountAutomaticAppFields
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }

  fragment DiscountCombinationFields on DiscountCombinesWith {
    orderDiscounts
    productDiscounts
    shippingDiscounts
  }

  fragment DiscountMinimumFields on DiscountMinimumRequirement {
    __typename
    ... on DiscountMinimumSubtotal {
      greaterThanOrEqualToSubtotal { amount currencyCode }
    }
    ... on DiscountMinimumQuantity {
      greaterThanOrEqualToQuantity
    }
  }

  fragment DiscountItemFields on DiscountItems {
    __typename
    ... on AllDiscountItems { allItems }
    ... on DiscountProducts {
      products(first: 100) { nodes { id } }
      productVariants(first: 100) {
        nodes { id sku product { id } }
      }
    }
    ... on DiscountCollections {
      collections(first: 100) { nodes { id } }
    }
  }

  fragment DiscountValueFields on DiscountCustomerGetsValue {
    __typename
    ... on DiscountPercentage { percentage }
    ... on DiscountAmount {
      amount { amount currencyCode }
      appliesOnEachItem
    }
  }

  fragment DiscountCodeBasicFields on DiscountCodeBasic {
    title summary status startsAt endsAt discountClasses
    codes(first: 1) { nodes { code } }
    combinesWith { ...DiscountCombinationFields }
    minimumRequirement { ...DiscountMinimumFields }
    customerGets {
      value { ...DiscountValueFields }
      items { ...DiscountItemFields }
    }
  }

  fragment DiscountAutomaticBasicFields on DiscountAutomaticBasic {
    title summary status startsAt endsAt discountClasses
    combinesWith { ...DiscountCombinationFields }
    minimumRequirement { ...DiscountMinimumFields }
    customerGets {
      value { ...DiscountValueFields }
      items { ...DiscountItemFields }
    }
  }

  fragment DiscountCodeFreeShippingFields on DiscountCodeFreeShipping {
    title summary status startsAt endsAt discountClasses
    codes(first: 1) { nodes { code } }
    combinesWith { ...DiscountCombinationFields }
    minimumRequirement { ...DiscountMinimumFields }
  }

  fragment DiscountAutomaticFreeShippingFields on DiscountAutomaticFreeShipping {
    title summary status startsAt endsAt discountClasses
    combinesWith { ...DiscountCombinationFields }
    minimumRequirement { ...DiscountMinimumFields }
  }

  fragment DiscountCodeBxgyFields on DiscountCodeBxgy {
    title summary status startsAt endsAt discountClasses
    codes(first: 1) { nodes { code } }
    combinesWith { ...DiscountCombinationFields }
    customerBuys {
      value { quantity }
      items { ...DiscountItemFields }
    }
    customerGets {
      value {
        quantity { quantity }
        effect { ...DiscountValueFields }
      }
      items { ...DiscountItemFields }
    }
  }

  fragment DiscountAutomaticBxgyFields on DiscountAutomaticBxgy {
    title summary status startsAt endsAt discountClasses
    combinesWith { ...DiscountCombinationFields }
    customerBuys {
      value { quantity }
      items { ...DiscountItemFields }
    }
    customerGets {
      value {
        quantity { quantity }
        effect { ...DiscountValueFields }
      }
      items { ...DiscountItemFields }
    }
  }

  fragment DiscountCodeAppFields on DiscountCodeApp {
    title status startsAt endsAt discountClasses
    codes(first: 1) { nodes { code } }
    combinesWith { ...DiscountCombinationFields }
    appDiscountType { title description }
  }

  fragment DiscountAutomaticAppFields on DiscountAutomaticApp {
    title status startsAt endsAt discountClasses
    combinesWith { ...DiscountCombinationFields }
    appDiscountType { title description }
  }
`;
