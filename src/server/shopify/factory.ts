import 'server-only';

import { readShopifyConfig } from './config.ts';
import { MockShopifyService } from './mock-service.ts';
import { RealShopifyService } from './real-service.ts';
import type { ShopifyService } from './service.ts';

export function createShopifyService(env: NodeJS.ProcessEnv = process.env): ShopifyService {
  const config = readShopifyConfig(env);
  return config.mode === 'live'
    ? new RealShopifyService(config)
    : new MockShopifyService();
}
