export const PRODUCTS_FOR_ELIGIBILITY_QUERY = /* GraphQL */ `
  query PromoLabEligibilityProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      nodes {
        id
        title
        handle
        status
        tags
        variants(first: 100) {
          nodes {
            id
            title
            sku
            price
            inventoryQuantity
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
