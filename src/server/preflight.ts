import 'server-only';

import { MockIntentParser } from '../adapters/intent-parser.ts';
import { MockShopifyExecutionAdapter } from '../adapters/shopify-execution.ts';
import type {
  DiscountExecutor,
  PreflightReport,
  PreflightRuntime,
} from '../domain/types.ts';
import { runPreflight } from '../engine/run-preflight.ts';
import {
  readShopifyDataMode,
  readShopifyExecutionMode,
} from './shopify/config.ts';
import { createShopifyService } from './shopify/factory.ts';
import type { ShopifyService } from './shopify/service.ts';

export interface ServerPreflightRuntime {
  modes: PreflightRuntime;
  shopifyService: ShopifyService;
  executor: DiscountExecutor;
}

let preflightRuntime: ServerPreflightRuntime | undefined;

export function createPreflightRuntime(
  env: NodeJS.ProcessEnv = process.env,
): ServerPreflightRuntime {
  const dataMode = readShopifyDataMode(env);
  const executionMode = readShopifyExecutionMode(env);

  if (executionMode === 'live') {
    throw new Error(
      'SHOPIFY_EXECUTION_MODE=live is not available yet. '
      + 'Use SHOPIFY_EXECUTION_MODE=mock until a Storefront Cart API adapter is implemented.',
    );
  }

  return {
    modes: { dataMode, executionMode },
    shopifyService: createShopifyService(env),
    executor: new MockShopifyExecutionAdapter(),
  };
}

export function getPreflightRuntime(): ServerPreflightRuntime {
  preflightRuntime ??= createPreflightRuntime();
  return preflightRuntime;
}

export function getShopifyService(): ShopifyService {
  return getPreflightRuntime().shopifyService;
}

export async function runServerPreflight(intent: string): Promise<PreflightReport> {
  const runtime = getPreflightRuntime();
  return runPreflight(intent, {
    intentParser: new MockIntentParser(),
    discountReader: runtime.shopifyService,
    executor: runtime.executor,
    runtime: runtime.modes,
  });
}
