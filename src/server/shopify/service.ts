import type { PromoLabDiscount } from '../../shopify/model.ts';
import type {
  ShopifyDiscountNodesResponse,
  ShopifyProduct,
  ShopifyProductsResponse,
} from '../../shopify/types.ts';

export interface ShopifyAdminToken {
  accessToken: string;
  scopes: string[];
  expiresAt: number | null;
}

export interface ShopifyDiscountQueryOptions {
  first?: number;
  after?: string;
  query?: string;
}

export interface ShopifyProductQueryOptions {
  first?: number;
  after?: string;
  query?: string;
}

/** Server-side boundary for every Shopify Admin API operation PromoLab needs. */
export interface ShopifyService {
  readonly mode: 'mock' | 'live';
  getAdminAccessToken(): Promise<ShopifyAdminToken>;
  queryDiscounts(options?: ShopifyDiscountQueryOptions): Promise<ShopifyDiscountNodesResponse>;
  queryProducts(options?: ShopifyProductQueryOptions): Promise<ShopifyProductsResponse>;
  getProductsForEligibility(options?: Pick<ShopifyProductQueryOptions, 'query'>): Promise<ShopifyProduct[]>;
  getActiveDiscounts(): Promise<PromoLabDiscount[]>;
}
