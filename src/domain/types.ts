import type {
  PromoLabCombinationPolicy,
  PromoLabDiscount,
  PromoLabDiscountCategory,
} from '../shopify/model.ts';

export type KnownDiscountCode = 'WELCOME10' | 'SUMMER20' | 'FREESHIP' | 'BUY2GET1';
export type DiscountCode = string;
export type Discount = PromoLabDiscount;
export type DiscountCategory = PromoLabDiscountCategory;
export type DiscountCombinationPolicy = PromoLabCombinationPolicy;

export interface CartLine {
  sku: string;
  title: string;
  quantity: number;
  unitPrice: number;
}

export interface CartFixture {
  id: string;
  name: string;
  description: string;
  lines: CartLine[];
  shippingPrice: number;
}

export type ExpectationKind =
  | 'discount-value'
  | 'incompatibility'
  | 'threshold'
  | 'independence';

export interface ExpectedRule {
  id: string;
  kind: ExpectationKind;
  title: string;
  statement: string;
  sourceText: string;
  discountCodes: DiscountCode[];
  value?: number;
  threshold?: number;
  resolution?: 'best-discount';
}

export interface ExpectedPromotion {
  name: string;
  summary: string;
  rules: ExpectedRule[];
  parser: 'mock-llm';
  confidence: number;
}

export interface Scenario {
  id: string;
  sequence: number;
  cart: CartFixture;
  discountCodes: DiscountCode[];
}

export interface RejectedDiscount {
  code: DiscountCode;
  reason: string;
}

export interface ExecutionResult {
  scenarioId: string;
  subtotal: number;
  productDiscount: number;
  orderDiscount: number;
  shippingDiscount: number;
  shippingPrice: number;
  total: number;
  appliedDiscounts: DiscountCode[];
  rejectedDiscounts: RejectedDiscount[];
  notes: string[];
}

export type ValidationStatus = 'pass' | 'fail' | 'warning';

export type ShopifyDataMode = 'mock' | 'live';
export type ShopifyExecutionMode = 'mock' | 'live';

export interface PreflightRuntime {
  dataMode: ShopifyDataMode;
  executionMode: ShopifyExecutionMode;
}

export interface ValidationResult {
  scenario: Scenario;
  execution: ExecutionResult;
  status: ValidationStatus;
  expectedDiscounts: DiscountCode[];
  reason: string;
  detail: string;
}

export interface PreflightReport {
  expectations: ExpectedPromotion;
  discounts: Discount[];
  scenarios: Scenario[];
  results: ValidationResult[];
  runtime: PreflightRuntime;
  generatedAt: string;
}

export interface IntentParser {
  parse(intent: string): Promise<ExpectedPromotion>;
}

export interface DiscountReader {
  getActiveDiscounts(): Promise<Discount[]>;
}

export interface DiscountExecutor {
  execute(scenario: Scenario, discounts: Discount[]): Promise<ExecutionResult>;
}
