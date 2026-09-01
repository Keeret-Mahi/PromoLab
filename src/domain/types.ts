export type DiscountCode = 'WELCOME10' | 'SUMMER20' | 'FREESHIP' | 'BUY2GET1';

export type DiscountCategory = 'order' | 'shipping' | 'product';

export interface DiscountCombinationPolicy {
  orderDiscounts: boolean;
  productDiscounts: boolean;
  shippingDiscounts: boolean;
}

export interface Discount {
  code: DiscountCode;
  title: string;
  category: DiscountCategory;
  method: 'code' | 'automatic';
  valueLabel: string;
  percentage?: number;
  minimumSubtotal?: number;
  eligibleSku?: string;
  requiredQuantity?: number;
  freeQuantity?: number;
  combinesWith: DiscountCombinationPolicy;
}

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
