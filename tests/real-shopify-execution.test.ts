import assert from 'node:assert/strict';
import test from 'node:test';
import type { Scenario } from '../src/domain/types.ts';
import { mapShopifyDiscounts } from '../src/shopify/mapper.ts';
import type { StorefrontCart } from '../src/shopify/storefront-types.ts';
import { MOCK_SHOPIFY_DISCOUNTS_RESPONSE } from '../src/server/shopify/mock-data.ts';
import { RealShopifyExecutionAdapter } from '../src/server/shopify/storefront/real-execution-adapter.ts';

const discounts = mapShopifyDiscounts(MOCK_SHOPIFY_DISCOUNTS_RESPONSE);
const scenario: Scenario = {
  id: 'live-summer',
  sequence: 1,
  cart: {
    id: 'live-cart',
    name: 'TechNest Keyboard',
    description: 'Live product',
    lines: [{
      merchandiseId: 'gid://shopify/ProductVariant/101',
      sku: 'TECH-101',
      title: 'TechNest Keyboard',
      quantity: 1,
      unitPrice: 100,
    }],
    shippingPrice: 0,
  },
  discountCodes: ['SUMMER20'],
};

const config = {
  shop: 'promo-lab-test',
  accessToken: 'storefront-test-token',
  apiVersion: '2026-07' as const,
};

function response(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function throttledResponse(): Response {
  return response({
    errors: [{
      message: 'Throttled',
      extensions: { code: 'THROTTLED' },
    }],
  });
}

function successfulResponse(operationRequest: number): Response {
  if (operationRequest === 1) {
    return response({ data: { cartCreate: {
      cart: createdCart(),
      userErrors: [],
      warnings: [],
    } } });
  }
  if (operationRequest === 2) {
    return response({ data: { cartDiscountCodesUpdate: {
      cart: { id: 'gid://shopify/Cart/1' },
      userErrors: [],
    } } });
  }
  return response({ data: { cart: finalCart() } });
}

function finalCart(): StorefrontCart {
  const application = {
    __typename: 'CartCodeDiscountApplication',
    targetType: 'LINE_ITEM',
    targetSelection: 'ALL',
    totalAllocatedAmount: { amount: '20.00', currencyCode: 'CAD' },
    code: 'SUMMER20',
  };
  return {
    id: 'gid://shopify/Cart/1',
    discountCodes: [{ code: 'SUMMER20', applicable: true }],
    discountApplications: [application],
    cost: {
      subtotalAmount: { amount: '100.00', currencyCode: 'CAD' },
      totalAmount: { amount: '80.00', currencyCode: 'CAD' },
    },
    lines: { nodes: [{
      id: 'gid://shopify/CartLine/1',
      quantity: 1,
      merchandise: {
        __typename: 'ProductVariant',
        id: 'gid://shopify/ProductVariant/101',
        title: 'Default',
        sku: 'TECH-101',
      },
      cost: {
        subtotalAmount: { amount: '100.00', currencyCode: 'CAD' },
        totalAmount: { amount: '80.00', currencyCode: 'CAD' },
      },
      discountAllocations: [{
        __typename: 'CartCodeDiscountAllocation',
        discountedAmount: { amount: '20.00', currencyCode: 'CAD' },
        targetType: 'LINE_ITEM',
        sourceDiscountApplication: application,
      }],
    }] },
  };
}

function cartForCodes(
  cartId: string,
  merchandiseId: string,
  quantity: number,
  codes: string[],
): StorefrontCart {
  const appliedCode = codes.includes('SUMMER20')
    ? 'SUMMER20'
    : codes.includes('WELCOME10')
      ? 'WELCOME10'
      : undefined;
  const discountAmount = appliedCode === 'SUMMER20' ? 20 : appliedCode === 'WELCOME10' ? 10 : 0;
  const application = appliedCode ? {
    __typename: 'CartCodeDiscountApplication',
    targetType: 'LINE_ITEM',
    targetSelection: 'ALL',
    totalAllocatedAmount: { amount: discountAmount.toFixed(2), currencyCode: 'CAD' },
    code: appliedCode,
  } : undefined;

  return {
    id: cartId,
    discountCodes: codes.map((code) => ({ code, applicable: code === appliedCode })),
    discountApplications: application ? [application] : [],
    cost: {
      subtotalAmount: { amount: '100.00', currencyCode: 'CAD' },
      totalAmount: { amount: (100 - discountAmount).toFixed(2), currencyCode: 'CAD' },
    },
    lines: { nodes: [{
      id: `${cartId}/line/1`,
      quantity,
      merchandise: {
        __typename: 'ProductVariant',
        id: merchandiseId,
        title: 'Default',
        sku: 'TECH-101',
      },
      cost: {
        subtotalAmount: { amount: '100.00', currencyCode: 'CAD' },
        totalAmount: { amount: (100 - discountAmount).toFixed(2), currencyCode: 'CAD' },
      },
      discountAllocations: application ? [{
        __typename: 'CartCodeDiscountAllocation',
        discountedAmount: { amount: discountAmount.toFixed(2), currencyCode: 'CAD' },
        targetType: 'LINE_ITEM',
        sourceDiscountApplication: application,
      }] : [],
    }] },
  };
}

function batchFetchHarness() {
  interface CartState {
    merchandiseId: string;
    quantity: number;
    codes: string[];
  }

  const state = {
    createCount: 0,
    requestCount: 0,
    updates: [] as Array<{ cartId: string; discountCodes: string[] }>,
  };
  const carts = new Map<string, CartState>();
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    state.requestCount += 1;
    const body = JSON.parse(String(init?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };

    if (body.query.includes('mutation PromoLabCartCreate')) {
      state.createCount += 1;
      const cartId = `gid://shopify/Cart/${state.createCount}`;
      const [line] = (body.variables.input as {
        lines: Array<{ merchandiseId: string; quantity: number }>;
      }).lines;
      assert.ok(line);
      carts.set(cartId, { ...line, codes: [] });
      return response({ data: { cartCreate: {
        cart: createdCart({
          id: cartId,
          lines: [{
            id: `${cartId}/line/created`,
            quantity: line.quantity,
            merchandise: {
              __typename: 'ProductVariant',
              id: line.merchandiseId,
              title: 'Default',
            },
          }],
        }),
        userErrors: [],
        warnings: [],
      } } });
    }

    if (body.query.includes('mutation PromoLabCartDiscountCodesUpdate')) {
      const variables = body.variables as unknown as {
        cartId: string;
        discountCodes: string[];
      };
      const cart = carts.get(variables.cartId);
      assert.ok(cart);
      cart.codes = [...variables.discountCodes];
      state.updates.push({
        cartId: variables.cartId,
        discountCodes: [...variables.discountCodes],
      });
      return response({ data: { cartDiscountCodesUpdate: {
        cart: { id: variables.cartId },
        userErrors: [],
      } } });
    }

    const { cartId } = body.variables as { cartId: string };
    const cart = carts.get(cartId);
    assert.ok(cart);
    return response({ data: {
      cart: cartForCodes(cartId, cart.merchandiseId, cart.quantity, cart.codes),
    } });
  }) as typeof fetch;

  return { fetchImpl, state };
}

function createdCart({
  id = 'gid://shopify/Cart/1',
  lines = [{
    id: 'gid://shopify/CartLine/created-1',
    quantity: 1,
    merchandise: {
      __typename: 'ProductVariant',
      id: 'gid://shopify/ProductVariant/101',
      title: 'Default',
    },
  }],
  subtotal = '100.00',
}: {
  id?: string;
  lines?: Array<{
    id: string;
    quantity: number;
    merchandise: {
      __typename: string;
      id?: string;
      title?: string;
    };
  }>;
  subtotal?: string;
} = {}) {
  return {
    id,
    lines: { nodes: lines },
    cost: {
      subtotalAmount: { amount: subtotal, currencyCode: 'CAD' },
      totalAmount: { amount: subtotal, currencyCode: 'CAD' },
    },
  };
}

test('adds a valid ProductVariant GID before applying codes and querying the cart', async () => {
  const requests: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    if (requests.length === 1) {
      return response({ data: { cartCreate: {
        cart: createdCart(),
        userErrors: [],
        warnings: [],
      } } });
    }
    if (requests.length === 2) {
      return response({ data: { cartDiscountCodesUpdate: {
        cart: { id: 'gid://shopify/Cart/1' },
        userErrors: [],
      } } });
    }
    return response({ data: { cart: finalCart() } });
  }) as typeof fetch;
  const adapter = new RealShopifyExecutionAdapter(config, { fetch: fetchImpl });

  const result = await adapter.execute(scenario, discounts);

  assert.equal(requests.length, 3);
  assert.equal(requests[0]?.url, 'https://promo-lab-test.myshopify.com/api/2026-07/graphql.json');
  assert.equal(
    requests[0]?.headers.get('Shopify-Storefront-Private-Token'),
    'storefront-test-token',
  );
  assert.deepEqual(
    (requests[0]?.body.variables as { input: { lines: unknown[] } }).input.lines,
    [{ merchandiseId: 'gid://shopify/ProductVariant/101', quantity: 1 }],
  );
  assert.deepEqual(
    requests[1]?.body.variables,
    { cartId: 'gid://shopify/Cart/1', discountCodes: ['SUMMER20'] },
  );
  assert.equal(result.status, 'completed');
  assert.equal(result.createdCart?.lines[0]?.merchandiseId, 'gid://shopify/ProductVariant/101');
  assert.equal(result.createdCart?.lines[0]?.quantity, 1);
  assert.equal(result.createdCart?.subtotal, 100);
  assert.equal(result.createdCart?.total, 100);
  assert.equal(result.total, 80);
});

test('reuses one Shopify cart for three independent discount combinations', async () => {
  const scenarios: Scenario[] = [
    { ...scenario, id: 'live-summer20', sequence: 1, discountCodes: ['SUMMER20'] },
    { ...scenario, id: 'live-welcome10', sequence: 2, discountCodes: ['WELCOME10'] },
    {
      ...scenario,
      id: 'live-summer20-welcome10',
      sequence: 3,
      discountCodes: ['SUMMER20', 'WELCOME10'],
    },
  ];
  const { fetchImpl, state } = batchFetchHarness();
  const adapter = new RealShopifyExecutionAdapter(config, { fetch: fetchImpl });

  const results = await adapter.executeScenarios(scenarios, discounts);

  assert.equal(state.createCount, 1);
  assert.equal(state.requestCount, 7);
  assert.deepEqual(state.updates, [
    { cartId: 'gid://shopify/Cart/1', discountCodes: ['SUMMER20'] },
    { cartId: 'gid://shopify/Cart/1', discountCodes: ['WELCOME10'] },
    {
      cartId: 'gid://shopify/Cart/1',
      discountCodes: ['SUMMER20', 'WELCOME10'],
    },
  ]);
  assert.deepEqual(results.map((result) => result.attemptedDiscountCodes), [
    ['SUMMER20'],
    ['WELCOME10'],
    ['SUMMER20', 'WELCOME10'],
  ]);
  assert.deepEqual(results.map((result) => result.total), [80, 90, 80]);
  assert.deepEqual(results[2]?.discountCodes, [
    { code: 'SUMMER20', applicable: true },
    { code: 'WELCOME10', applicable: false },
  ]);
  assert.deepEqual(results.map((result) => result.discountAllocations[0]?.code), [
    'SUMMER20',
    'WELCOME10',
    'SUMMER20',
  ]);
  assert.ok(results.every(
    (result) => result.createdCart?.cartId === 'gid://shopify/Cart/1',
  ));
});

test('creates one Shopify cart for each of two distinct TestCarts', async () => {
  const secondScenario: Scenario = {
    ...scenario,
    id: 'second-cart-welcome',
    sequence: 3,
    cart: {
      ...scenario.cart,
      id: 'second-live-cart',
      lines: [{
        ...scenario.cart.lines[0]!,
        merchandiseId: 'gid://shopify/ProductVariant/202',
      }],
    },
    discountCodes: ['WELCOME10'],
  };
  const scenarios: Scenario[] = [
    { ...scenario, id: 'first-cart-summer', sequence: 1 },
    { ...scenario, id: 'first-cart-welcome', sequence: 2, discountCodes: ['WELCOME10'] },
    secondScenario,
  ];
  const { fetchImpl, state } = batchFetchHarness();
  const adapter = new RealShopifyExecutionAdapter(config, { fetch: fetchImpl });

  const results = await adapter.executeScenarios(scenarios, discounts);

  assert.equal(state.createCount, 2);
  assert.equal(results.length, 3);
  assert.equal(results[0]?.createdCart?.cartId, results[1]?.createdCart?.cartId);
  assert.notEqual(results[1]?.createdCart?.cartId, results[2]?.createdCart?.cartId);
});

test('retries a THROTTLED Storefront response and then succeeds', async () => {
  let requests = 0;
  const delays: number[] = [];
  const fetchImpl = (async () => {
    requests += 1;
    return requests === 1 ? throttledResponse() : successfulResponse(requests - 1);
  }) as typeof fetch;
  const adapter = new RealShopifyExecutionAdapter(config, {
    fetch: fetchImpl,
    sleep: async (milliseconds) => { delays.push(milliseconds); },
    random: () => 0,
  });

  const result = await adapter.execute(scenario, discounts);

  assert.equal(result.status, 'completed');
  assert.equal(requests, 4);
  assert.deepEqual(delays, [1_000]);
});

test('uses exponential backoff for multiple throttles and then succeeds', async () => {
  let requests = 0;
  const delays: number[] = [];
  const throttleCount = 3;
  const fetchImpl = (async () => {
    requests += 1;
    return requests <= throttleCount
      ? throttledResponse()
      : successfulResponse(requests - throttleCount);
  }) as typeof fetch;
  const adapter = new RealShopifyExecutionAdapter(config, {
    fetch: fetchImpl,
    sleep: async (milliseconds) => { delays.push(milliseconds); },
    random: () => 0,
  });

  const result = await adapter.execute(scenario, discounts);

  assert.equal(result.status, 'completed');
  assert.equal(requests, 6);
  assert.deepEqual(delays, [1_000, 2_000, 4_000]);
});

test('returns a clear diagnostic after Storefront throttle retries are exhausted', async () => {
  let requests = 0;
  const delays: number[] = [];
  const fetchImpl = (async () => {
    requests += 1;
    return throttledResponse();
  }) as typeof fetch;
  const adapter = new RealShopifyExecutionAdapter(config, {
    fetch: fetchImpl,
    sleep: async (milliseconds) => { delays.push(milliseconds); },
    random: () => 0,
  });

  const result = await adapter.execute(scenario, discounts);

  assert.equal(result.status, 'storefront_cart_error');
  assert.equal(requests, 5);
  assert.deepEqual(delays, [1_000, 2_000, 4_000, 8_000]);
  assert.match(
    result.notes.join(' '),
    /Shopify temporarily throttled Storefront cart creation after 4 retries\. Try the preflight again shortly\./,
  );
});

test('does not retry a non-throttle Storefront GraphQL error', async () => {
  let requests = 0;
  const delays: number[] = [];
  const fetchImpl = (async () => {
    requests += 1;
    return response({
      errors: [{
        message: 'Access denied',
        extensions: { code: 'ACCESS_DENIED' },
      }],
    });
  }) as typeof fetch;
  const adapter = new RealShopifyExecutionAdapter(config, {
    fetch: fetchImpl,
    sleep: async (milliseconds) => { delays.push(milliseconds); },
    random: () => 0,
  });

  await assert.rejects(
    adapter.execute(scenario, discounts),
    /Shopify Storefront GraphQL error during cartCreate: Access denied/,
  );
  assert.equal(requests, 1);
  assert.deepEqual(delays, []);
});

test('rejects a Product GID before cartCreate and identifies the exact merchandiseId', async () => {
  let requests = 0;
  const fetchImpl = (async () => {
    requests += 1;
    throw new Error('An invalid merchandise ID must not reach Shopify.');
  }) as typeof fetch;
  const adapter = new RealShopifyExecutionAdapter(config, { fetch: fetchImpl });
  const wrongIdScenario: Scenario = {
    ...scenario,
    cart: {
      ...scenario.cart,
      lines: [{
        ...scenario.cart.lines[0]!,
        merchandiseId: 'gid://shopify/Product/101',
      }],
    },
  };

  const result = await adapter.execute(wrongIdScenario, discounts);

  assert.equal(requests, 0);
  assert.equal(result.status, 'storefront_cart_error');
  assert.equal(result.createdCart, undefined);
  assert.match(result.notes[0] ?? '', /gid:\/\/shopify\/Product\/101/);
  assert.match(result.notes[0] ?? '', /ProductVariant/);
});

test('stops when cartCreate returns a cart with no merchandise lines', async () => {
  let requests = 0;
  const fetchImpl = (async () => {
    requests += 1;
    return response({ data: { cartCreate: {
      cart: createdCart({ lines: [], subtotal: '0.00' }),
      userErrors: [],
      warnings: [],
    } } });
  }) as typeof fetch;
  const adapter = new RealShopifyExecutionAdapter(config, { fetch: fetchImpl });

  const result = await adapter.execute(scenario, discounts);

  assert.equal(requests, 1);
  assert.equal(result.status, 'storefront_cart_error');
  assert.deepEqual(result.createdCart?.lines, []);
  assert.equal(result.createdCart?.subtotal, 0);
  assert.match(result.notes[0] ?? '', /accepted no merchandise lines/i);
  assert.match(result.notes[0] ?? '', /published to the Headless storefront/i);
});

test('stops when cartCreate returns no cart', async () => {
  let requests = 0;
  const fetchImpl = (async () => {
    requests += 1;
    return response({ data: { cartCreate: {
      cart: null,
      userErrors: [],
      warnings: [],
    } } });
  }) as typeof fetch;
  const adapter = new RealShopifyExecutionAdapter(config, { fetch: fetchImpl });

  const result = await adapter.execute(scenario, discounts);

  assert.equal(requests, 1);
  assert.equal(result.status, 'storefront_cart_error');
  assert.match(result.notes[0] ?? '', /returned no cart/i);
});

test('returns normalized Storefront user errors without falling back to mock execution', async () => {
  let requests = 0;
  const fetchImpl = (async () => {
    requests += 1;
    return response({ data: { cartCreate: {
      cart: null,
      userErrors: [{
        field: ['input', 'lines', '0', 'merchandiseId'],
        message: 'Merchandise is not available',
        code: 'MERCHANDISE_NOT_APPLICABLE',
      }],
      warnings: [],
    } } });
  }) as typeof fetch;
  const adapter = new RealShopifyExecutionAdapter(config, { fetch: fetchImpl });

  const result = await adapter.execute(scenario, discounts);

  assert.equal(requests, 1);
  assert.equal(result.status, 'storefront_user_error');
  assert.equal(result.userErrors[0]?.stage, 'cartCreate');
  assert.equal(result.userErrors[0]?.code, 'MERCHANDISE_NOT_APPLICABLE');
  assert.deepEqual(result.appliedDiscounts, []);
});

test('surfaces cartCreate merchandise warnings and does not apply discount codes', async () => {
  let requests = 0;
  const fetchImpl = (async () => {
    requests += 1;
    return response({ data: { cartCreate: {
      cart: createdCart({ lines: [], subtotal: '0.00' }),
      userErrors: [],
      warnings: [{
        code: 'MERCHANDISE_OUT_OF_STOCK',
        message: 'The merchandise is out of stock.',
        target: 'gid://shopify/ProductVariant/101',
      }],
    } } });
  }) as typeof fetch;
  const adapter = new RealShopifyExecutionAdapter(config, { fetch: fetchImpl });

  const result = await adapter.execute(scenario, discounts);

  assert.equal(requests, 1);
  assert.equal(result.status, 'storefront_cart_error');
  assert.equal(result.warnings[0]?.code, 'MERCHANDISE_OUT_OF_STOCK');
  assert.equal(result.warnings[0]?.target, 'gid://shopify/ProductVariant/101');
  assert.deepEqual(result.createdCart?.lines, []);
  assert.match(result.notes[0] ?? '', /out of stock/i);
});

test('stops on a zero-subtotal created cart when the Admin scenario is non-zero', async () => {
  let requests = 0;
  const fetchImpl = (async () => {
    requests += 1;
    return response({ data: { cartCreate: {
      cart: createdCart({ subtotal: '0.00' }),
      userErrors: [],
      warnings: [],
    } } });
  }) as typeof fetch;
  const adapter = new RealShopifyExecutionAdapter(config, { fetch: fetchImpl });

  const result = await adapter.execute(scenario, discounts);

  assert.equal(requests, 1);
  assert.equal(result.status, 'storefront_cart_error');
  assert.equal(result.createdCart?.lines[0]?.merchandiseId, 'gid://shopify/ProductVariant/101');
  assert.equal(result.createdCart?.subtotal, 0);
  assert.match(result.notes[0] ?? '', /zero subtotal/i);
  assert.match(result.notes[0] ?? '', /100\.00/);
});

test('shipping discount scenarios are explicit and make no Storefront request', async () => {
  let requests = 0;
  const fetchImpl = (async () => {
    requests += 1;
    throw new Error('Shipping scenarios must stop before fetch.');
  }) as typeof fetch;
  const adapter = new RealShopifyExecutionAdapter(config, { fetch: fetchImpl });
  const shippingScenario = { ...scenario, discountCodes: ['FREESHIP'] };

  const result = await adapter.execute(shippingScenario, discounts);

  assert.equal(requests, 0);
  assert.equal(result.status, 'unsupported_live_shipping_context');
  assert.match(result.notes.join(' '), /delivery context/i);
});
