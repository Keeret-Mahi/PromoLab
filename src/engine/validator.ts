import { getCartSubtotal } from '../data/fixtures.ts';
import type {
  DiscountCode,
  ExecutionResult,
  ExpectedPromotion,
  Scenario,
  ValidationResult,
} from '../domain/types.ts';

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function hasEligibleBogoCart(scenario: Scenario): boolean {
  return scenario.cart.lines.some((line) => line.sku === 'TEE-CLASSIC' && line.quantity >= 3);
}

export function deriveExpectedDiscounts(
  scenario: Scenario,
  expectations: ExpectedPromotion,
): DiscountCode[] {
  const requested = new Set(scenario.discountCodes);
  const expected: DiscountCode[] = [];
  const subtotal = getCartSubtotal(scenario.cart);
  const threshold = expectations.rules.find((rule) => rule.kind === 'threshold')?.threshold ?? 75;

  if (requested.has('WELCOME10')) expected.push('WELCOME10');
  if (requested.has('SUMMER20')) expected.push('SUMMER20');
  if (requested.has('BUY2GET1') && hasEligibleBogoCart(scenario)) expected.push('BUY2GET1');
  if (requested.has('FREESHIP') && subtotal >= threshold) expected.push('FREESHIP');

  if (requested.has('WELCOME10') && requested.has('SUMMER20')) {
    return expected.filter((code) => code !== 'WELCOME10');
  }

  return expected;
}

function expectedAmounts(
  scenario: Scenario,
  expectations: ExpectedPromotion,
  expectedDiscounts: DiscountCode[],
) {
  const subtotal = getCartSubtotal(scenario.cart);
  const eligibleTee = scenario.cart.lines.find(
    (line) => line.sku === 'TEE-CLASSIC' && line.quantity >= 3,
  );
  const productDiscount = expectedDiscounts.includes('BUY2GET1')
    ? eligibleTee?.unitPrice ?? 0
    : 0;
  const summerPercentage = expectations.rules.find((rule) => rule.id === 'summer-value')?.value ?? 20;
  const orderPercentage = expectedDiscounts.includes('SUMMER20')
    ? summerPercentage
    : expectedDiscounts.includes('WELCOME10')
      ? 10
      : 0;

  return {
    productDiscount: roundMoney(productDiscount),
    orderDiscount: roundMoney((subtotal - productDiscount) * (orderPercentage / 100)),
    shippingDiscount: expectedDiscounts.includes('FREESHIP') ? scenario.cart.shippingPrice : 0,
  };
}

function sameSet(left: DiscountCode[], right: DiscountCode[]): boolean {
  return left.length === right.length && left.every((code) => right.includes(code));
}

export function validateScenario(
  scenario: Scenario,
  execution: ExecutionResult,
  expectations: ExpectedPromotion,
): ValidationResult {
  const expectedDiscounts = deriveExpectedDiscounts(scenario, expectations);
  const missing = expectedDiscounts.filter((code) => !execution.appliedDiscounts.includes(code));
  const unexpected = execution.appliedDiscounts.filter((code) => !expectedDiscounts.includes(code));
  const expected = expectedAmounts(scenario, expectations, expectedDiscounts);
  const amountMismatch =
    expected.productDiscount !== execution.productDiscount ||
    expected.orderDiscount !== execution.orderDiscount ||
    expected.shippingDiscount !== execution.shippingDiscount;
  const isExpectedIncompatibility =
    scenario.discountCodes.includes('WELCOME10') &&
    scenario.discountCodes.includes('SUMMER20') &&
    sameSet(expectedDiscounts, execution.appliedDiscounts) &&
    !amountMismatch;

  if (missing.length || unexpected.length || amountMismatch) {
    const missingRejection = execution.rejectedDiscounts.find((item) => missing.includes(item.code));
    const reason = missing.length
      ? `Expected ${missing.join(' + ')} to apply, but it did not.`
      : unexpected.length
        ? `${unexpected.join(' + ')} applied unexpectedly.`
        : 'The applied discount amount differed from the expected rule.';
    const detail = missingRejection?.reason
      ?? `Expected product/order/shipping savings of $${expected.productDiscount.toFixed(2)} / $${expected.orderDiscount.toFixed(2)} / $${expected.shippingDiscount.toFixed(2)}, but received $${execution.productDiscount.toFixed(2)} / $${execution.orderDiscount.toFixed(2)} / $${execution.shippingDiscount.toFixed(2)}.`;

    return { scenario, execution, status: 'fail', expectedDiscounts, reason, detail };
  }

  if (isExpectedIncompatibility) {
    return {
      scenario,
      execution,
      status: 'warning',
      expectedDiscounts,
      reason: 'Expected incompatibility confirmed.',
      detail: 'Both order codes were tested. Shopify kept SUMMER20 and rejected WELCOME10, matching the best-discount rule.',
    };
  }

  const eligibilityNote = execution.notes[0];
  return {
    scenario,
    execution,
    status: 'pass',
    expectedDiscounts,
    reason: eligibilityNote ? 'Eligibility behaved as expected.' : 'Actual behaviour matches the expected rules.',
    detail: eligibilityNote ?? 'The applied discounts and monetary allocations match the deterministic expectation.',
  };
}
