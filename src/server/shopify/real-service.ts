import 'server-only';

import {
  mapShopifyDiscounts,
  mapShopifyProducts,
} from '../../shopify/mapper.ts';
import type {
  PromoLabDiscount,
  PromoLabProduct,
} from '../../shopify/model.ts';
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
  access_token?: unknown;
  scope?: unknown;
  expires_in?: unknown;
}

export interface RealShopifyServiceOptions {
  /** Injectable for isolated tests. The production default is the server runtime's fetch. */
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  maxRetries?: number;
}

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 250;
const DEFAULT_MAX_RETRIES = 2;
const TOKEN_REFRESH_SKEW_MS = 60_000;
const MAX_RETRY_DELAY_MS = 30_000;
const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

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

function validateApiVersion(apiVersion: string): string {
  const value = apiVersion.trim();
  if (!/^\d{4}-(01|04|07|10)$/.test(value)) {
    throw new Error('SHOPIFY_API_VERSION must be a stable Shopify API version such as 2026-07.');
  }
  return value;
}

function validatePageSize(first: number | undefined): number {
  const value = first ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw new RangeError(`Shopify page size must be an integer from 1 to ${MAX_PAGE_SIZE}.`);
  }
  return value;
}

function normalizeCursor(after: string | undefined): string | null {
  if (after === undefined) return null;
  if (!after.trim()) throw new Error('A Shopify pagination cursor cannot be empty.');
  return after;
}

function splitScopes(scope: unknown): string[] {
  if (typeof scope !== 'string') return [];
  return scope.split(/[,\s]+/).map((value) => value.trim()).filter(Boolean);
}

function retryAfterMilliseconds(response: Response, attempt: number, now: number): number {
  const retryAfter = response.headers.get('Retry-After');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, MAX_RETRY_DELAY_MS);
    }

    const timestamp = Date.parse(retryAfter);
    if (Number.isFinite(timestamp)) {
      return Math.min(Math.max(timestamp - now, 0), MAX_RETRY_DELAY_MS);
    }
  }

  return Math.min(500 * (2 ** attempt), MAX_RETRY_DELAY_MS);
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Server-only Shopify Admin API client. Construction performs no network work;
 * token exchange starts only when a live service method is explicitly called.
 */
export class RealShopifyService implements ShopifyService {
  readonly mode = 'live' as const;
  private readonly config: LiveShopifyConfig;
  private readonly shopHost: string;
  private readonly apiVersion: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly maxRetries: number;
  private tokenCache: ShopifyAdminToken | null = null;
  private tokenRequest: Promise<ShopifyAdminToken> | null = null;

  constructor(
    config: LiveShopifyConfig,
    options: RealShopifyServiceOptions = {},
  ) {
    this.config = config;
    this.shopHost = normalizeShopHost(config.shop);
    this.apiVersion = validateApiVersion(config.apiVersion);
    if (!config.clientId.trim() || !config.clientSecret.trim()) {
      throw new Error('Shopify client credentials cannot be empty in live mode.');
    }

    this.fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('The server runtime must provide fetch for live Shopify requests.');
    }
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    if (!Number.isInteger(this.maxRetries) || this.maxRetries < 0 || this.maxRetries > 10) {
      throw new RangeError('maxRetries must be an integer from 0 to 10.');
    }
  }

  async getAdminAccessToken(): Promise<ShopifyAdminToken> {
    if (this.hasUsableCachedToken()) return this.tokenCache as ShopifyAdminToken;
    if (this.tokenRequest) return this.tokenRequest;

    this.tokenRequest = this.requestAdminAccessToken();
    try {
      return await this.tokenRequest;
    } finally {
      this.tokenRequest = null;
    }
  }

  private hasUsableCachedToken(): boolean {
    return Boolean(
      this.tokenCache
      && (
        this.tokenCache.expiresAt === null
        || this.tokenCache.expiresAt - TOKEN_REFRESH_SKEW_MS > this.now()
      ),
    );
  }

  private async requestAdminAccessToken(): Promise<ShopifyAdminToken> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });
    const response = await this.fetchWithRetry(
      `https://${this.shopHost}/admin/oauth/access_token`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        cache: 'no-store',
      },
      'token exchange',
    );

    if (!response.ok) {
      throw this.httpError('token exchange', response);
    }

    const payload = await this.readJson<ShopifyTokenResponse>(response, 'token exchange');
    if (typeof payload.access_token !== 'string' || !payload.access_token) {
      throw new Error('Shopify token exchange did not return an access token.');
    }
    if (
      payload.expires_in !== undefined
      && (!Number.isFinite(payload.expires_in) || Number(payload.expires_in) <= 0)
    ) {
      throw new Error('Shopify token exchange returned an invalid expiry.');
    }

    const expiresIn = payload.expires_in === undefined ? null : Number(payload.expires_in);
    const token: ShopifyAdminToken = {
      accessToken: payload.access_token,
      scopes: splitScopes(payload.scope),
      expiresAt: expiresIn === null ? null : this.now() + expiresIn * 1_000,
    };
    this.tokenCache = token;
    return token;
  }

  private async fetchWithRetry(
    input: string,
    init: RequestInit,
    operation: string,
  ): Promise<Response> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImpl(input, init);
      } catch (cause) {
        if (attempt < this.maxRetries) {
          await this.sleep(Math.min(500 * (2 ** attempt), MAX_RETRY_DELAY_MS));
          continue;
        }
        throw new Error(`Shopify ${operation} could not reach the Admin API.`, { cause });
      }

      if (RETRYABLE_HTTP_STATUSES.has(response.status) && attempt < this.maxRetries) {
        await this.sleep(retryAfterMilliseconds(response, attempt, this.now()));
        continue;
      }
      return response;
    }

    throw new Error(`Shopify ${operation} exhausted its retry policy.`);
  }

  private httpError(operation: string, response: Response): Error {
    const requestId = response.headers.get('X-Request-ID');
    const suffix = requestId ? ` Request ID: ${requestId}.` : '';
    return new Error(`Shopify ${operation} failed with HTTP ${response.status}.${suffix}`);
  }

  private async readJson<T>(response: Response, operation: string): Promise<T> {
    try {
      return await response.json() as T;
    } catch (cause) {
      throw new Error(`Shopify ${operation} returned invalid JSON.`, { cause });
    }
  }

  private graphqlThrottleDelay(payload: ShopifyGraphQLResponse<unknown>, attempt: number): number {
    const cost = payload.extensions?.cost;
    const status = cost?.throttleStatus;
    if (status && status.restoreRate > 0) {
      const requested = cost.requestedQueryCost ?? 1;
      const deficit = Math.max(requested - status.currentlyAvailable, 0);
      return Math.min(
        Math.max(Math.ceil((deficit / status.restoreRate) * 1_000) + 100, 250),
        MAX_RETRY_DELAY_MS,
      );
    }
    return Math.min(500 * (2 ** attempt), MAX_RETRY_DELAY_MS);
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    let refreshedAfterUnauthorized = false;
    let throttleAttempts = 0;

    while (true) {
      const token = await this.getAdminAccessToken();
      const response = await this.fetchWithRetry(
        `https://${this.shopHost}/admin/api/${this.apiVersion}/graphql.json`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': token.accessToken,
          },
          body: JSON.stringify({ query, variables }),
          cache: 'no-store',
        },
        'GraphQL request',
      );

      if (response.status === 401 && !refreshedAfterUnauthorized) {
        if (this.tokenCache?.accessToken === token.accessToken) this.tokenCache = null;
        refreshedAfterUnauthorized = true;
        continue;
      }
      if (!response.ok) throw this.httpError('GraphQL request', response);

      const payload = await this.readJson<ShopifyGraphQLResponse<T>>(response, 'GraphQL request');
      if (payload.errors?.length) {
        const throttled = payload.errors.some((error) => error.extensions?.code === 'THROTTLED');
        if (throttled && throttleAttempts < this.maxRetries) {
          await this.sleep(this.graphqlThrottleDelay(payload, throttleAttempts));
          throttleAttempts += 1;
          continue;
        }

        const messages = payload.errors.map((error) => error.message).join('; ');
        throw new Error(`Shopify GraphQL error: ${messages}`);
      }
      if (!payload.data) throw new Error('Shopify GraphQL response did not include data.');
      return payload.data;
    }
  }

  queryDiscounts(options: ShopifyDiscountQueryOptions = {}): Promise<ShopifyDiscountNodesResponse> {
    return this.graphql(DISCOUNT_NODES_QUERY, {
      first: validatePageSize(options.first),
      after: normalizeCursor(options.after),
      query: options.query?.trim() || 'status:active',
    });
  }

  queryProducts(options: ShopifyProductQueryOptions = {}): Promise<ShopifyProductsResponse> {
    return this.graphql(PRODUCTS_FOR_ELIGIBILITY_QUERY, {
      first: validatePageSize(options.first),
      after: normalizeCursor(options.after),
      query: options.query?.trim() || null,
    });
  }

  async getProductsForEligibility(
    options: Pick<ShopifyProductQueryOptions, 'query'> = {},
  ): Promise<PromoLabProduct[]> {
    const products: ShopifyProductsResponse['products']['nodes'] = [];
    const seenCursors = new Set<string>();
    let after: string | undefined;

    while (true) {
      const page = await this.queryProducts({
        first: MAX_PAGE_SIZE,
        after,
        query: options.query,
      });
      products.push(...page.products.nodes);

      const { hasNextPage, endCursor } = page.products.pageInfo;
      if (!hasNextPage) {
        return mapShopifyProducts({
          products: {
            nodes: products,
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        });
      }
      if (!endCursor || seenCursors.has(endCursor)) {
        throw new Error('Shopify products pagination returned an invalid cursor.');
      }
      seenCursors.add(endCursor);
      after = endCursor;
    }
  }

  async getActiveDiscounts(): Promise<PromoLabDiscount[]> {
    const nodes: ShopifyDiscountNodesResponse['discountNodes']['nodes'] = [];
    const seenCursors = new Set<string>();
    let after: string | undefined;

    while (true) {
      const page = await this.queryDiscounts({
        first: MAX_PAGE_SIZE,
        after,
        query: 'status:active',
      });
      nodes.push(...page.discountNodes.nodes);

      const { hasNextPage, endCursor } = page.discountNodes.pageInfo;
      if (!hasNextPage) break;
      if (!endCursor || seenCursors.has(endCursor)) {
        throw new Error('Shopify discounts pagination returned an invalid cursor.');
      }
      seenCursors.add(endCursor);
      after = endCursor;
    }

    return mapShopifyDiscounts({
      discountNodes: {
        nodes,
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
  }
}
