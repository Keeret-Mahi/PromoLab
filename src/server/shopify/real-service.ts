import 'server-only';

import { mapShopifyDiscounts } from '../../shopify/mapper.ts';
import type { PromoLabDiscount } from '../../shopify/model.ts';
import type {
  ShopifyDiscountNodesResponse,
  ShopifyGraphQLResponse,
  ShopifyProductsResponse,
} from '../../shopify/types.ts';
import type { LiveShopifyConfig } from './config.ts';
import { DISCOUNT_NODES_QUERY } from './queries/discount-nodes.ts';
import { PRODUCTS_FOR_ELIGIBILITY_QUERY } from './queries/products.ts';
import type {
  ShopifyAdminToken,
  ShopifyDiscountQueryOptions,
  ShopifyProductQueryOptions,
  ShopifyService,
} from './service.ts';

interface ShopifyTokenResponse {
  access_token: string;
  scope?: string;
  expires_in?: number;
}

function normalizeShopHost(shop: string): string {
  const host = shop
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  const normalized = host.includes('.') ? host : `${host}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(normalized)) {
    throw new Error('SHOPIFY_SHOP must be a shop slug or a *.myshopify.com host.');
  }
  return normalized;
}

/**
 * Live Admin API implementation. It is instantiated only when SHOPIFY_MODE=live
 * and performs no network work until one of its methods is called.
 */
export class RealShopifyService implements ShopifyService {
  readonly mode = 'live' as const;
  private readonly shopHost: string;
  private tokenCache: ShopifyAdminToken | null = null;

  constructor(private readonly config: LiveShopifyConfig) {
    this.shopHost = normalizeShopHost(config.shop);
  }

  async getAdminAccessToken(): Promise<ShopifyAdminToken> {
    const now = Date.now();
    if (this.tokenCache?.expiresAt && this.tokenCache.expiresAt - 60_000 > now) {
      return this.tokenCache;
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });
    const response = await fetch(`https://${this.shopHost}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Shopify token request failed with HTTP ${response.status}.`);
    }

    const token = await response.json() as ShopifyTokenResponse;
    if (!token.access_token) throw new Error('Shopify returned no Admin API access token.');

    this.tokenCache = {
      accessToken: token.access_token,
      scopes: token.scope?.split(',').map((scope) => scope.trim()).filter(Boolean) ?? [],
      expiresAt: token.expires_in ? now + token.expires_in * 1000 : null,
    };
    return this.tokenCache;
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const token = await this.getAdminAccessToken();
    const response = await fetch(
      `https://${this.shopHost}/admin/api/${this.config.apiVersion}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token.accessToken,
        },
        body: JSON.stringify({ query, variables }),
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      throw new Error(`Shopify GraphQL request failed with HTTP ${response.status}.`);
    }
    const payload = await response.json() as ShopifyGraphQLResponse<T>;
    if (payload.errors?.length) {
      throw new Error(`Shopify GraphQL error: ${payload.errors.map((error) => error.message).join('; ')}`);
    }
    if (!payload.data) throw new Error('Shopify GraphQL response did not include data.');
    return payload.data;
  }

  queryDiscounts(options: ShopifyDiscountQueryOptions = {}): Promise<ShopifyDiscountNodesResponse> {
    return this.graphql(DISCOUNT_NODES_QUERY, {
      first: options.first ?? 100,
      after: options.after ?? null,
    });
  }

  queryProducts(options: ShopifyProductQueryOptions = {}): Promise<ShopifyProductsResponse> {
    return this.graphql(PRODUCTS_FOR_ELIGIBILITY_QUERY, {
      first: options.first ?? 100,
      after: options.after ?? null,
      query: options.query ?? null,
    });
  }

  async getActiveDiscounts(): Promise<PromoLabDiscount[]> {
    return mapShopifyDiscounts(await this.queryDiscounts());
  }
}
