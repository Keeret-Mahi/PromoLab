import 'server-only';

import type {
  CreatedCartSnapshot,
  Discount,
  DiscountExecutor,
  ExecutionResult,
  ExecutionUserError,
  ExecutionWarning,
  Scenario,
} from '../../../domain/types.ts';
import { getCartSubtotal } from '../../../data/fixtures.ts';
import {
  mapStorefrontCartExecution,
  mapStorefrontCartFailure,
  normalizeStorefrontUserErrors,
  normalizeStorefrontWarnings,
} from '../../../shopify/storefront-mapper.ts';
import type {
  StorefrontCartCreateData,
  StorefrontCartDiscountCodesUpdateData,
  StorefrontCartQueryData,
  StorefrontGraphQLResponse,
} from '../../../shopify/storefront-types.ts';
import type { LiveStorefrontConfig } from '../config.ts';
import {
  STOREFRONT_CART_CREATE_MUTATION,
  STOREFRONT_CART_DISCOUNT_CODES_UPDATE_MUTATION,
  STOREFRONT_CART_QUERY,
} from './queries.ts';

type StorefrontCreatedCart = NonNullable<StorefrontCartCreateData['cartCreate']['cart']>;

interface PreparedStorefrontCart {
  cartId: string;
  snapshot: CreatedCartSnapshot;
}

interface StorefrontCartPreparationFailure {
  reason: string;
  userErrors: ExecutionUserError[];
  warnings: ExecutionWarning[];
  snapshot?: CreatedCartSnapshot;
}

type StorefrontCartPreparation =
  | { ok: true; cart: PreparedStorefrontCart }
  | { ok: false; failure: StorefrontCartPreparationFailure };

export interface RealShopifyExecutionAdapterOptions {
  /** Injectable so tests can exercise the complete flow without network access. */
  fetch?: typeof globalThis.fetch;
  /** Injectable so retry timing can be tested without waiting. */
  sleep?: (milliseconds: number) => Promise<void>;
  /** Injectable so retry jitter is deterministic in tests. */
  random?: () => number;
  /** Number of retries after the initial throttled request. Defaults to four. */
  maxThrottleRetries?: number;
}

const THROTTLE_RETRY_BASE_DELAY_MS = 1_000;
const THROTTLE_RETRY_MAX_DELAY_MS = 8_000;
const THROTTLE_JITTER_RATIO = 0.2;
const DEFAULT_MAX_THROTTLE_RETRIES = 4;

class StorefrontThrottleError extends Error {}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function throttleOperationLabel(operation: string): string {
  if (operation === 'cartCreate') return 'Storefront cart creation';
  if (operation === 'cartDiscountCodesUpdate') return 'Storefront discount update';
  return 'Storefront cart retrieval';
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

function unsupportedShippingExecution(scenario: Scenario): ExecutionResult {
  const reason = 'Live shipping-discount execution requires delivery context and is not supported yet.';
  return {
    scenarioId: scenario.id,
    status: 'unsupported_live_shipping_context',
    attemptedDiscountCodes: [...scenario.discountCodes],
    discountCodes: [],
    discountAllocations: [],
    lines: [],
    userErrors: [],
    warnings: [],
    currencyCode: 'CAD',
    subtotal: 0,
    productDiscount: 0,
    orderDiscount: 0,
    shippingDiscount: 0,
    shippingPrice: 0,
    total: 0,
    appliedDiscounts: [],
    rejectedDiscounts: scenario.discountCodes.map((code) => ({ code, reason })),
    notes: ['unsupported_live_shipping_context', reason],
  };
}

const PRODUCT_VARIANT_GID = /^gid:\/\/shopify\/ProductVariant\/[1-9]\d*$/;

function merchandiseTrace(lines: Array<{ merchandiseId: string; quantity: number }>): string {
  return lines
    .map((line) => `${line.merchandiseId} × ${line.quantity}`)
    .join(', ');
}

function storefrontAvailabilityHint(trace: string): string {
  return `Attempted merchandise: ${trace}. Confirm that this exact variant is active, in stock, `
    + 'and published to the Headless storefront sales channel.';
}

function cartCompositionKey(scenario: Scenario): string {
  return JSON.stringify({
    testCartId: scenario.cart.id,
    lines: scenario.cart.lines.map(({ merchandiseId, quantity }) => ({
      merchandiseId: merchandiseId ?? null,
      quantity,
    })),
  });
}

function createdCartSnapshot(cart: StorefrontCreatedCart): CreatedCartSnapshot {
  return {
    cartId: cart.id,
    lines: cart.lines.nodes.map((line) => ({
      id: line.id,
      quantity: line.quantity,
      merchandiseType: line.merchandise.__typename,
      ...(line.merchandise.id ? { merchandiseId: line.merchandise.id } : {}),
      ...(line.merchandise.title ? { title: line.merchandise.title } : {}),
    })),
    subtotal: Number(cart.cost.subtotalAmount.amount),
    total: Number(cart.cost.totalAmount.amount),
    currencyCode: cart.cost.totalAmount.currencyCode,
  };
}

/** Server-only Storefront Cart API executor. Shopify is the source of all live amounts. */
export class RealShopifyExecutionAdapter implements DiscountExecutor {
  private readonly endpoint: string;
  private readonly accessToken: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly sleepImpl: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly maxThrottleRetries: number;

  constructor(
    config: LiveStorefrontConfig,
    options: RealShopifyExecutionAdapterOptions = {},
  ) {
    const shopHost = normalizeShopHost(config.shop);
    if (!config.accessToken.trim()) {
      throw new Error('SHOPIFY_STOREFRONT_ACCESS_TOKEN cannot be empty in live execution mode.');
    }
    if (config.apiVersion !== '2026-07') {
      throw new Error('Live Storefront execution requires Shopify API version 2026-07.');
    }

    this.endpoint = `https://${shopHost}/api/${config.apiVersion}/graphql.json`;
    this.accessToken = config.accessToken;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.sleepImpl = options.sleep ?? sleep;
    this.random = options.random ?? Math.random;
    this.maxThrottleRetries = options.maxThrottleRetries ?? DEFAULT_MAX_THROTTLE_RETRIES;
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('The server runtime must provide fetch for live Shopify Storefront requests.');
    }
    if (!Number.isInteger(this.maxThrottleRetries) || this.maxThrottleRetries < 0) {
      throw new Error('maxThrottleRetries must be a non-negative integer.');
    }
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
    operation: string,
  ): Promise<T> {
    let throttleRetries = 0;

    while (true) {
      let response: Response;
      try {
        response = await this.fetchImpl(this.endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Shopify-Storefront-Private-Token': this.accessToken,
          },
          body: JSON.stringify({ query, variables }),
          cache: 'no-store',
        });
      } catch (cause) {
        throw new Error(`Shopify Storefront ${operation} request failed.`, { cause });
      }

      if (!response.ok) {
        const requestId = response.headers.get('X-Request-ID');
        const suffix = requestId ? ` Request ID: ${requestId}.` : '';
        throw new Error(
          `Shopify Storefront ${operation} failed with HTTP ${response.status}.${suffix}`,
        );
      }

      let payload: StorefrontGraphQLResponse<T>;
      try {
        payload = await response.json() as StorefrontGraphQLResponse<T>;
      } catch (cause) {
        throw new Error(`Shopify Storefront ${operation} returned invalid JSON.`, { cause });
      }

      if (payload.errors?.length) {
        const onlyThrottledErrors = payload.errors.every(
          (error) => error.extensions?.code === 'THROTTLED',
        );
        if (onlyThrottledErrors) {
          if (throttleRetries >= this.maxThrottleRetries) {
            throw new StorefrontThrottleError(
              `Shopify temporarily throttled ${throttleOperationLabel(operation)} after `
              + `${this.maxThrottleRetries} retries. Try the preflight again shortly.`,
            );
          }

          const exponentialDelay = Math.min(
            THROTTLE_RETRY_BASE_DELAY_MS * (2 ** throttleRetries),
            THROTTLE_RETRY_MAX_DELAY_MS,
          );
          const randomValue = Math.min(Math.max(this.random(), 0), 1);
          const jitter = Math.round(exponentialDelay * THROTTLE_JITTER_RATIO * randomValue);
          throttleRetries += 1;
          await this.sleepImpl(exponentialDelay + jitter);
          continue;
        }

        throw new Error(
          `Shopify Storefront GraphQL error during ${operation}: ${payload.errors
            .map((error) => error.message)
            .join('; ')}`,
        );
      }
      if (!payload.data) {
        throw new Error(`Shopify Storefront ${operation} response did not include data.`);
      }
      return payload.data;
    }
  }

  async execute(scenario: Scenario, discounts: Discount[]): Promise<ExecutionResult> {
    const [result] = await this.executeScenarios([scenario], discounts);
    if (!result) throw new Error('Live Storefront execution did not return a scenario result.');
    return result;
  }

  /** Creates one Shopify cart per test-cart composition, then replaces codes sequentially. */
  async executeScenarios(
    scenarios: Scenario[],
    discounts: Discount[],
  ): Promise<ExecutionResult[]> {
    const results: Array<ExecutionResult | undefined> = new Array(scenarios.length);
    const cartGroups = new Map<string, Array<{ scenario: Scenario; index: number }>>();

    scenarios.forEach((scenario, index) => {
      const hasShippingDiscount = scenario.discountCodes.some((code) => {
        const discount = discounts.find(
          (candidate) => candidate.code.toLowerCase() === code.toLowerCase(),
        );
        return discount?.category === 'shipping' || code.toUpperCase() === 'FREESHIP';
      });
      if (hasShippingDiscount) {
        results[index] = unsupportedShippingExecution(scenario);
        return;
      }

      const key = cartCompositionKey(scenario);
      const group = cartGroups.get(key) ?? [];
      group.push({ scenario, index });
      cartGroups.set(key, group);
    });

    for (const group of cartGroups.values()) {
      const representative = group[0];
      if (!representative) continue;

      let preparation: StorefrontCartPreparation;
      try {
        preparation = await this.createCart(representative.scenario);
      } catch (cause) {
        if (!(cause instanceof StorefrontThrottleError)) throw cause;
        for (const { scenario, index } of group) {
          results[index] = mapStorefrontCartFailure(scenario, cause.message, []);
        }
        continue;
      }

      if (!preparation.ok) {
        for (const { scenario, index } of group) {
          results[index] = this.mapPreparationFailure(scenario, preparation.failure);
        }
        continue;
      }

      for (const { scenario, index } of group) {
        try {
          results[index] = await this.executeDiscountCombination(
            scenario,
            discounts,
            preparation.cart,
          );
        } catch (cause) {
          if (!(cause instanceof StorefrontThrottleError)) throw cause;
          results[index] = mapStorefrontCartFailure(
            scenario,
            cause.message,
            [],
            [],
            preparation.cart.snapshot,
          );
        }
      }
    }

    return results.map((result) => {
      if (!result) throw new Error('Live Storefront execution missed a scenario result.');
      return result;
    });
  }

  private mapPreparationFailure(
    scenario: Scenario,
    failure: StorefrontCartPreparationFailure,
  ): ExecutionResult {
    return mapStorefrontCartFailure(
      scenario,
      failure.reason,
      failure.userErrors,
      failure.warnings,
      failure.snapshot,
    );
  }

  private async createCart(scenario: Scenario): Promise<StorefrontCartPreparation> {

    if (!scenario.cart.lines.length) {
      throw new Error('Live Storefront execution requires at least one cart line.');
    }
    const invalidLine = scenario.cart.lines.find(
      (line) => !line.merchandiseId || !PRODUCT_VARIANT_GID.test(line.merchandiseId),
    );
    if (invalidLine) {
      return { ok: false, failure: {
        reason: `Live Storefront execution rejected merchandiseId "${invalidLine.merchandiseId ?? ''}". `
          + 'A real numeric gid://shopify/ProductVariant/<id> is required; Product GIDs, SKUs, '
          + 'mock IDs, and local IDs are not accepted.',
        userErrors: [],
        warnings: [],
      } };
    }

    const invalidQuantity = scenario.cart.lines.find(
      (line) => !Number.isInteger(line.quantity) || line.quantity < 1,
    );
    if (invalidQuantity) {
      return { ok: false, failure: {
        reason: `Live Storefront execution requires a positive integer quantity for ${invalidQuantity.title}.`,
        userErrors: [],
        warnings: [],
      } };
    }

    const lines = scenario.cart.lines.map((line) => {
      if (!line.merchandiseId) {
        // The validation above narrows this at runtime; keep the GraphQL input explicitly typed.
        throw new Error('Validated Storefront merchandise ID was unexpectedly missing.');
      }
      return { merchandiseId: line.merchandiseId, quantity: line.quantity };
    });
    const trace = merchandiseTrace(lines);

    const createData = await this.graphql<StorefrontCartCreateData>(
      STOREFRONT_CART_CREATE_MUTATION,
      { input: { lines } },
      'cartCreate',
    );
    const createErrors = normalizeStorefrontUserErrors(
      'cartCreate',
      createData.cartCreate.userErrors,
    );
    const createWarnings = normalizeStorefrontWarnings(createData.cartCreate.warnings);
    const createdCart = createData.cartCreate.cart;
    const createSnapshot = createdCart ? createdCartSnapshot(createdCart) : undefined;
    if (createErrors.length) {
      return { ok: false, failure: {
        reason: `Shopify cartCreate returned an error and the cart was not accepted. ${storefrontAvailabilityHint(trace)}`,
        userErrors: createErrors,
        warnings: createWarnings,
        ...(createSnapshot ? { snapshot: createSnapshot } : {}),
      } };
    }
    if (!createdCart) {
      return { ok: false, failure: {
        reason: `Shopify cartCreate returned no cart. ${storefrontAvailabilityHint(trace)}`,
        userErrors: [],
        warnings: createWarnings,
      } };
    }
    if (createWarnings.length) {
      const warningSummary = createWarnings
        .map((warning) => `${warning.code}: ${warning.message} (target ${warning.target})`)
        .join('; ');
      return { ok: false, failure: {
        reason: `Shopify cartCreate returned a merchandise warning: ${warningSummary}. ${storefrontAvailabilityHint(trace)}`,
        userErrors: [],
        warnings: createWarnings,
        snapshot: createSnapshot,
      } };
    }
    if (!createdCart.lines.nodes.length) {
      return { ok: false, failure: {
        reason: `Shopify created cart ${createdCart.id} but accepted no merchandise lines. ${storefrontAvailabilityHint(trace)}`,
        userErrors: [],
        warnings: [],
        snapshot: createSnapshot,
      } };
    }

    const rejectedLine = lines.find((requested) => {
      const returned = createdCart.lines.nodes.find(
        (line) => line.merchandise.__typename === 'ProductVariant'
          && line.merchandise.id === requested.merchandiseId,
      );
      return !returned || returned.quantity !== requested.quantity;
    });
    if (rejectedLine) {
      return { ok: false, failure: {
        reason: `Shopify did not return the requested variant and quantity on the created cart. ${storefrontAvailabilityHint(trace)}`,
        userErrors: [],
        warnings: [],
        snapshot: createSnapshot,
      } };
    }

    const createdSubtotal = Number(createdCart.cost.subtotalAmount.amount);
    const scenarioSubtotal = getCartSubtotal(scenario.cart);
    if (!Number.isFinite(createdSubtotal)) {
      return { ok: false, failure: {
        reason: `Shopify cartCreate returned an invalid subtotal for cart ${createdCart.id}. ${storefrontAvailabilityHint(trace)}`,
        userErrors: [],
        warnings: [],
        snapshot: createSnapshot,
      } };
    }
    if (scenarioSubtotal > 0 && createdSubtotal <= 0) {
      return { ok: false, failure: {
        reason: `Shopify created cart ${createdCart.id} with a zero subtotal even though the Admin-side `
          + `scenario subtotal is ${scenarioSubtotal.toFixed(2)}. ${storefrontAvailabilityHint(trace)}`,
        userErrors: [],
        warnings: [],
        snapshot: createSnapshot,
      } };
    }

    return {
      ok: true,
      cart: { cartId: createdCart.id, snapshot: createdCartSnapshot(createdCart) },
    };
  }

  private async executeDiscountCombination(
    scenario: Scenario,
    discounts: Discount[],
    preparedCart: PreparedStorefrontCart,
  ): Promise<ExecutionResult> {
    const { cartId, snapshot } = preparedCart;
    const updateData = await this.graphql<StorefrontCartDiscountCodesUpdateData>(
      STOREFRONT_CART_DISCOUNT_CODES_UPDATE_MUTATION,
      { cartId, discountCodes: [...scenario.discountCodes] },
      'cartDiscountCodesUpdate',
    );
    const updateErrors = normalizeStorefrontUserErrors(
      'cartDiscountCodesUpdate',
      updateData.cartDiscountCodesUpdate.userErrors,
    );
    if (!updateData.cartDiscountCodesUpdate.cart) {
      return mapStorefrontCartFailure(
        scenario,
        updateErrors.length
          ? `Shopify cartDiscountCodesUpdate failed: ${updateErrors[0].message}`
          : 'Shopify cartDiscountCodesUpdate returned no cart and no user error.',
        updateErrors,
        [],
        snapshot,
      );
    }

    const cartData = await this.graphql<StorefrontCartQueryData>(
      STOREFRONT_CART_QUERY,
      { cartId },
      'cart query',
    );
    if (!cartData.cart) {
      throw new Error('Shopify Storefront could not retrieve the resulting cart.');
    }

    return {
      ...mapStorefrontCartExecution(scenario, discounts, cartData.cart, updateErrors),
      createdCart: snapshot,
    };
  }
}
