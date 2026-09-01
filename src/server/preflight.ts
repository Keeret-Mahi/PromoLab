import 'server-only';

import { MockIntentParser } from '../adapters/intent-parser.ts';
import { MockShopifyExecutionAdapter } from '../adapters/shopify-execution.ts';
import type { PreflightReport } from '../domain/types.ts';
import { runPreflight } from '../engine/run-preflight.ts';
import { createShopifyService } from './shopify/factory.ts';
import type { ShopifyService } from './shopify/service.ts';

let shopifyService: ShopifyService | undefined;

export function getShopifyService(): ShopifyService {
  shopifyService ??= createShopifyService();
  return shopifyService;
}

export async function runServerPreflight(intent: string): Promise<PreflightReport> {
  return runPreflight(intent, {
    intentParser: new MockIntentParser(),
    discountReader: getShopifyService(),
    executor: new MockShopifyExecutionAdapter(),
  });
}
