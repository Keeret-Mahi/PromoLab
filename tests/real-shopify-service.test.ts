import assert from 'node:assert/strict';
import test from 'node:test';
import { createShopifyService } from '../src/server/shopify/factory.ts';
import { MOCK_SHOPIFY_DISCOUNTS_RESPONSE } from '../src/server/shopify/mock-data.ts';
import { RealShopifyService } from '../src/server/shopify/real-service.ts';
import type { LiveShopifyConfig } from '../src/server/shopify/config.ts';
import type {
  ShopifyDiscountNodesResponse,
  ShopifyGraphQLResponse,
  ShopifyProductsResponse,
} from '../src/shopify/types.ts';

const config: LiveShopifyConfig = {
  mode: 'live',
  shop: 'promo-lab-test',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  apiVersion: '2026-07',
};

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input.toString();
}

test('mock mode is credential-free and does not construct the live service', () => {
  const service = createShopifyService({ SHOPIFY_MODE: 'mock' } as unknown as NodeJS.ProcessEnv);
  assert.equal(service.mode, 'mock');
});

test('exchanges client credentials, caches the token, and sends authenticated GraphQL requests', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const now = 1_800_000_000_000;
  const products: ShopifyProductsResponse = {
    products: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    calls.push({ url, init });
    if (url.endsWith('/admin/oauth/access_token')) {
      return jsonResponse({
        access_token: 'server-token',
        scope: 'read_discounts,read_products',
        expires_in: 86_400,
      });
    }
    return jsonResponse({ data: products } satisfies ShopifyGraphQLResponse<ShopifyProductsResponse>);
  }) as typeof fetch;

  const service = new RealShopifyService(config, { fetch: fetchImpl, now: () => now });
  await service.queryProducts({ first: 25, after: 'cursor-1', query: 'tag:promo-eligible' });
  await service.queryProducts({ first: 10 });

  assert.equal(calls.length, 3, 'one token request should serve both GraphQL calls');
  assert.equal(calls[0]?.url, 'https://promo-lab-test.myshopify.com/admin/oauth/access_token');
  assert.equal(calls[0]?.init?.method, 'POST');
  assert.equal(new Headers(calls[0]?.init?.headers).get('Content-Type'), 'application/x-www-form-urlencoded');
  assert.equal(
    (calls[0]?.init?.body as URLSearchParams).toString(),
    'grant_type=client_credentials&client_id=test-client-id&client_secret=test-client-secret',
  );

  assert.equal(
    calls[1]?.url,
    'https://promo-lab-test.myshopify.com/admin/api/2026-07/graphql.json',
  );
  assert.equal(new Headers(calls[1]?.init?.headers).get('X-Shopify-Access-Token'), 'server-token');
  const graphQLBody = JSON.parse(String(calls[1]?.init?.body)) as {
    query: string;
    variables: Record<string, unknown>;
  };
  assert.match(graphQLBody.query, /query PromoLabEligibilityProducts/);
  assert.deepEqual(graphQLBody.variables, {
    first: 25,
    after: 'cursor-1',
    query: 'tag:promo-eligible',
  });

  assert.deepEqual(await service.getAdminAccessToken(), {
    accessToken: 'server-token',
    scopes: ['read_discounts', 'read_products'],
    expiresAt: now + 86_400_000,
  });
});

test('refreshes an unauthorized token once and retries with the replacement token', async () => {
  let tokenRequests = 0;
  const graphQLTokens: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (requestUrl(input).endsWith('/admin/oauth/access_token')) {
      tokenRequests += 1;
      return jsonResponse({ access_token: `token-${tokenRequests}`, expires_in: 86_400 });
    }

    graphQLTokens.push(new Headers(init?.headers).get('X-Shopify-Access-Token') ?? '');
    if (graphQLTokens.length === 1) return jsonResponse({}, { status: 401 });
    const products: ShopifyProductsResponse = {
      products: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    };
    return jsonResponse({ data: products });
  }) as typeof fetch;

  const service = new RealShopifyService(config, { fetch: fetchImpl, maxRetries: 0 });
  await service.queryProducts();

  assert.equal(tokenRequests, 2);
  assert.deepEqual(graphQLTokens, ['token-1', 'token-2']);
});

test('paginates all active discounts and eligibility products', async () => {
  const discountPages = [
    {
      discountNodes: {
        nodes: MOCK_SHOPIFY_DISCOUNTS_RESPONSE.discountNodes.nodes.slice(0, 2),
        pageInfo: { hasNextPage: true, endCursor: 'discount-page-2' },
      },
    },
    {
      discountNodes: {
        nodes: MOCK_SHOPIFY_DISCOUNTS_RESPONSE.discountNodes.nodes.slice(2),
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  ] satisfies ShopifyDiscountNodesResponse[];
  const productPages = [
    {
      products: {
        nodes: [{
          id: 'gid://shopify/Product/1',
          title: 'One',
          handle: 'one',
          status: 'ACTIVE' as const,
          tags: [],
          variants: { nodes: [] },
        }],
        pageInfo: { hasNextPage: true, endCursor: 'product-page-2' },
      },
    },
    {
      products: {
        nodes: [{
          id: 'gid://shopify/Product/2',
          title: 'Two',
          handle: 'two',
          status: 'DRAFT' as const,
          tags: [],
          variants: { nodes: [] },
        }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  ] satisfies ShopifyProductsResponse[];
  const cursors: Array<string | null> = [];

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (requestUrl(input).endsWith('/admin/oauth/access_token')) {
      return jsonResponse({ access_token: 'token', expires_in: 86_400 });
    }
    const body = JSON.parse(String(init?.body)) as {
      query: string;
      variables: { after: string | null };
    };
    cursors.push(body.variables.after);
    if (body.query.includes('PromoLabDiscountNodes')) {
      return jsonResponse({ data: discountPages.shift() });
    }
    return jsonResponse({ data: productPages.shift() });
  }) as typeof fetch;

  const service = new RealShopifyService(config, { fetch: fetchImpl });
  const discounts = await service.getActiveDiscounts();
  const products = await service.getProductsForEligibility({ query: 'status:active' });

  assert.deepEqual(discounts.map((discount) => discount.code), [
    'WELCOME10',
    'SUMMER20',
    'FREESHIP',
    'BUY2GET1',
  ]);
  assert.deepEqual(products.map((product) => product.id), [
    'gid://shopify/Product/1',
    'gid://shopify/Product/2',
  ]);
  assert.deepEqual(cursors, [null, 'discount-page-2', null, 'product-page-2']);
});

test('retries Shopify throttling responses without using the network in tests', async () => {
  const delays: number[] = [];
  let graphQLAttempts = 0;
  const fetchImpl = (async (input: RequestInfo | URL) => {
    if (requestUrl(input).endsWith('/admin/oauth/access_token')) {
      return jsonResponse({ access_token: 'token', expires_in: 86_400 });
    }
    graphQLAttempts += 1;
    if (graphQLAttempts === 1) {
      return jsonResponse({
        errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }],
        extensions: {
          cost: {
            requestedQueryCost: 100,
            throttleStatus: { maximumAvailable: 1_000, currentlyAvailable: 50, restoreRate: 50 },
          },
        },
      });
    }
    const products: ShopifyProductsResponse = {
      products: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    };
    return jsonResponse({ data: products });
  }) as typeof fetch;

  const service = new RealShopifyService(config, {
    fetch: fetchImpl,
    sleep: async (milliseconds) => { delays.push(milliseconds); },
  });
  await service.queryProducts();

  assert.equal(graphQLAttempts, 2);
  assert.deepEqual(delays, [1_100]);
});
