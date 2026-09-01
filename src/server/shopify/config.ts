import 'server-only';

export interface LiveShopifyConfig {
  mode: 'live';
  shop: string;
  clientId: string;
  clientSecret: string;
  apiVersion: string;
}

export interface MockShopifyConfig {
  mode: 'mock';
}

export type ShopifyConfig = MockShopifyConfig | LiveShopifyConfig;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required when SHOPIFY_MODE=live.`);
  return value;
}

export function readShopifyConfig(env: NodeJS.ProcessEnv = process.env): ShopifyConfig {
  const mode = env.SHOPIFY_MODE?.trim().toLowerCase() || 'mock';
  if (mode !== 'mock' && mode !== 'live') {
    throw new Error('SHOPIFY_MODE must be either mock or live.');
  }
  if (mode === 'mock') return { mode };

  return {
    mode,
    shop: required(env, 'SHOPIFY_SHOP'),
    clientId: required(env, 'SHOPIFY_CLIENT_ID'),
    clientSecret: required(env, 'SHOPIFY_CLIENT_SECRET'),
    apiVersion: env.SHOPIFY_API_VERSION?.trim() || '2026-07',
  };
}
