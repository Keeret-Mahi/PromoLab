import 'server-only';

import { MockIntentParser } from '../adapters/intent-parser.ts';
import { MockShopifyExecutionAdapter } from '../adapters/shopify-execution.ts';
import type {
  Discount,
  DiscountExecutor,
  PreflightReport,
  PreflightRuntime,
} from '../domain/types.ts';
import { preparePreflight, runPreflight } from '../engine/run-preflight.ts';
import { generateLiveStorefrontScenarios } from '../engine/live-storefront-scenarios.ts';
import {
  readStorefrontConfig,
  readShopifyDataMode,
  readShopifyExecutionMode,
} from './shopify/config.ts';
import { createShopifyService } from './shopify/factory.ts';
import type { ShopifyService } from './shopify/service.ts';
import {
  RealShopifyExecutionAdapter,
  type RealShopifyExecutionAdapterOptions,
} from './shopify/storefront/real-execution-adapter.ts';

export interface ServerPreflightRuntime {
  modes: PreflightRuntime;
  shopifyService: ShopifyService;
  executor: DiscountExecutor;
}

export interface CreatePreflightRuntimeOptions {
  storefront?: RealShopifyExecutionAdapterOptions;
}

let preflightRuntime: ServerPreflightRuntime | undefined;

export function createPreflightRuntime(
  env: NodeJS.ProcessEnv = process.env,
  options: CreatePreflightRuntimeOptions = {},
): ServerPreflightRuntime {
  const dataMode = readShopifyDataMode(env);
  const executionMode = readShopifyExecutionMode(env);

  if (executionMode === 'live' && dataMode !== 'live') {
    throw new Error(
      'SHOPIFY_EXECUTION_MODE=live requires SHOPIFY_DATA_MODE=live so real Shopify variant IDs '
      + 'are used for every Storefront cart.',
    );
  }

  const executor = executionMode === 'live'
    ? new RealShopifyExecutionAdapter(readStorefrontConfig(env), options.storefront)
    : new MockShopifyExecutionAdapter();

  return {
    modes: { dataMode, executionMode },
    shopifyService: createShopifyService(env),
    executor,
  };
}

export function getPreflightRuntime(): ServerPreflightRuntime {
  preflightRuntime ??= createPreflightRuntime();
  return preflightRuntime;
}

export function getShopifyService(): ShopifyService {
  return getPreflightRuntime().shopifyService;
}

function serverPreflightDependencies(runtime: ServerPreflightRuntime) {
  return {
    intentParser: new MockIntentParser(),
    discountReader: runtime.shopifyService,
    executor: runtime.executor,
    runtime: runtime.modes,
    ...(runtime.modes.executionMode === 'live'
      ? {
          scenarioBuilder: async (discounts: Discount[]) => generateLiveStorefrontScenarios(
            discounts,
            await runtime.shopifyService.getProductsForEligibility({ query: 'status:active' }),
          ),
        }
      : {}),
  };
}

/** Builds render-time data without touching the live Storefront execution adapter. */
export async function prepareServerPreflight(
  intent: string,
  runtime: ServerPreflightRuntime = getPreflightRuntime(),
): Promise<PreflightReport> {
  if (runtime.modes.executionMode === 'mock') {
    return runPreflight(intent, serverPreflightDependencies(runtime));
  }
  return preparePreflight(intent, serverPreflightDependencies(runtime));
}

/** Explicit execution entry point used by POST /api/preflight. */
export async function runServerPreflight(
  intent: string,
  runtime: ServerPreflightRuntime = getPreflightRuntime(),
): Promise<PreflightReport> {
  return runPreflight(intent, serverPreflightDependencies(runtime));
}
