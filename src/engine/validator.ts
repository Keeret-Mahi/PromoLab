import { getCartSubtotal } from '../data/fixtures.ts';
import type {
  Discount,
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
  discounts: Discount[],
) {
  const subtotal = getCartSubtotal(scenario.cart);
  const expectedModels = expectedDiscounts.flatMap((code) => {
    const discount = discounts.find(
      (candidate) => candidate.code.toLowerCase() === code.toLowerCase(),
    );
    return discount ? [discount] : [];
  });

  const percentageFor = (discount: Discount): number => {
    const expectedRule = expectations.rules.find(
      (rule) => rule.kind === 'discount-value'
        && rule.discountCodes.some(
          (code) => code.toLowerCase() === discount.code.toLowerCase(),
        )
        && rule.value !== undefined,
    );
    if (expectedRule?.value !== undefined) return expectedRule.value;
    return discount.value.kind === 'percentage' ? discount.value.percentage : 0;
  };

  const productSavingsFor = (discount: Discount): number => {
    if (discount.value.kind === 'buy-x-get-y') {
      const eligibleLine = scenario.cart.lines.find((line) =>
        (discount.eligibility.allProducts || discount.eligibility.skus.includes(line.sku))
        && line.quantity >= (discount.eligibility.minimumQuantity ?? 1),
      );
      if (!eligibleLine) return 0;
      const perItemSavings = discount.value.getPercentage !== undefined
        ? eligibleLine.unitPrice * (discount.value.getPercentage / 100)
        : discount.value.getAmount ?? eligibleLine.unitPrice;
      return perItemSavings * discount.value.getQuantity;
    }
    if (discount.value.kind === 'fixed-amount') {
      return Math.min(discount.value.amount, subtotal);
    }
    return subtotal * (percentageFor(discount) / 100);
  };

  const productDiscount = roundMoney(expectedModels
    .filter((discount) => discount.category === 'product')
    .reduce((total, discount) => total + productSavingsFor(discount), 0));
  const orderSubtotal = Math.max(subtotal - productDiscount, 0);
  const orderDiscount = roundMoney(expectedModels
    .filter((discount) => discount.category === 'order')
    .reduce((total, discount) => {
      if (discount.value.kind === 'fixed-amount') {
        return total + Math.min(discount.value.amount, orderSubtotal);
      }
      return total + orderSubtotal * (percentageFor(discount) / 100);
    }, 0));
  const shippingDiscount = expectedModels.some(
    (discount) => discount.category === 'shipping',
  )
    ? scenario.cart.shippingPrice
    : 0;

  return {
    productDiscount,
    orderDiscount,
    shippingDiscount: roundMoney(shippingDiscount),
  };
}

function sameSet(left: DiscountCode[], right: DiscountCode[]): boolean {
  return left.length === right.length && left.every((code) => right.includes(code));
}

export function validateScenario(
  scenario: Scenario,
  execution: ExecutionResult,
  expectations: ExpectedPromotion,
  discounts: Discount[],
): ValidationResult {
  const expectedDiscounts = deriveExpectedDiscounts(scenario, expectations);

  if (execution.status === 'unsupported_live_shipping_context') {
    return {
      scenario,
      execution,
      status: 'fail',
      expectedDiscounts,
      reason: 'This scenario needs live shipping context.',
      detail: execution.notes.find((note) => note !== 'unsupported_live_shipping_context')
        ?? 'Live shipping-discount execution is not supported yet.',
    };
  }

  if (execution.status === 'storefront_user_error') {
    return {
      scenario,
      execution,
      status: 'fail',
      expectedDiscounts,
      reason: 'Shopify could not complete this cart test.',
      detail: execution.userErrors
        .map((error) => `${error.stage}: ${error.message}`)
        .join(' ') || 'The Storefront cart mutation failed.',
    };
  }

  if (execution.status === 'storefront_cart_error') {
    return {
      scenario,
      execution,
      status: 'fail',
      expectedDiscounts,
      reason: 'Shopify did not accept the test merchandise.',
      detail: execution.notes[0] ?? 'The Storefront cart could not be created as requested.',
    };
  }

  const missing = expectedDiscounts.filter((code) => !execution.appliedDiscounts.includes(code));
  const unexpected = execution.appliedDiscounts.filter((code) => !expectedDiscounts.includes(code));
  const expected = expectedAmounts(scenario, expectations, expectedDiscounts, discounts);
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
      detail: 'Both discount codes were tested. The execution kept SUMMER20 and rejected WELCOME10, matching the best-discount rule.',
    };
  }

  const eligibilityNote = execution.notes[0];
  return {
    scenario,
    execution,
    status: 'pass',
    expectedDiscounts,
    reason: eligibilityNote ? 'Eligibility behaved as expected.' : 'Execution matches the expected rules.',
    detail: eligibilityNote ?? 'The applied discounts and monetary allocations match the deterministic expectation.',
  };
}
