import 'server-only';

import type {
  ShopifyDataMode,
  ShopifyExecutionMode,
} from '../../domain/types.ts';

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
  if (!value) throw new Error(`${name} is required when SHOPIFY_DATA_MODE=live.`);
  return value;
}

function readMode<T extends 'mock' | 'live'>(
  env: NodeJS.ProcessEnv,
  name: string,
): T {
  const mode = env[name]?.trim().toLowerCase() || 'mock';
  if (mode !== 'mock' && mode !== 'live') {
    throw new Error(`${name} must be either mock or live.`);
  }
  return mode as T;
}

export function readShopifyDataMode(
  env: NodeJS.ProcessEnv = process.env,
): ShopifyDataMode {
  return readMode<ShopifyDataMode>(env, 'SHOPIFY_DATA_MODE');
}

export function readShopifyExecutionMode(
  env: NodeJS.ProcessEnv = process.env,
): ShopifyExecutionMode {
  return readMode<ShopifyExecutionMode>(env, 'SHOPIFY_EXECUTION_MODE');
}

export function readShopifyConfig(env: NodeJS.ProcessEnv = process.env): ShopifyConfig {
  const mode = readShopifyDataMode(env);
  if (mode === 'mock') return { mode };

  return {
    mode,
    shop: required(env, 'SHOPIFY_SHOP'),
    clientId: required(env, 'SHOPIFY_CLIENT_ID'),
    clientSecret: required(env, 'SHOPIFY_CLIENT_SECRET'),
    apiVersion: env.SHOPIFY_API_VERSION?.trim() || '2026-07',
  };
}
