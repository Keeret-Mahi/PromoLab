import 'server-only';

import { mapShopifyDiscounts } from '../../shopify/mapper.ts';
import type { PromoLabDiscount } from '../../shopify/model.ts';
import type {
  ShopifyDiscountNodesResponse,
  ShopifyProduct,
  ShopifyProductsResponse,
} from '../../shopify/types.ts';
import {
  MOCK_SHOPIFY_DISCOUNTS_RESPONSE,
  MOCK_SHOPIFY_PRODUCTS_RESPONSE,
} from './mock-data.ts';
import type {
  ShopifyAdminToken,
  ShopifyService,
} from './service.ts';

export class MockShopifyService implements ShopifyService {
  readonly mode = 'mock' as const;

  async getAdminAccessToken(): Promise<ShopifyAdminToken> {
    return { accessToken: 'mock-only-token', scopes: [], expiresAt: null };
  }

  async queryDiscounts(): Promise<ShopifyDiscountNodesResponse> {
    return structuredClone(MOCK_SHOPIFY_DISCOUNTS_RESPONSE);
  }

  async queryProducts(): Promise<ShopifyProductsResponse> {
    return structuredClone(MOCK_SHOPIFY_PRODUCTS_RESPONSE);
  }

  async getProductsForEligibility(): Promise<ShopifyProduct[]> {
    return structuredClone(MOCK_SHOPIFY_PRODUCTS_RESPONSE.products.nodes);
  }

  async getActiveDiscounts(): Promise<PromoLabDiscount[]> {
    const response = await this.queryDiscounts();
    return mapShopifyDiscounts(response).map((discount) => ({ ...discount, source: 'mock' }));
  }
}
