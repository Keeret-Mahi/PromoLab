import { getCartSubtotal } from '../data/fixtures.ts';
import type {
  Discount,
  DiscountCode,
  DiscountExecutor,
  ExecutionResult,
  RejectedDiscount,
  Scenario,
} from '../domain/types.ts';

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function findDiscount(discounts: Discount[], code: DiscountCode): Discount {
  const discount = discounts.find((candidate) => candidate.code === code);
  if (!discount) throw new Error(`Missing discount fixture: ${code}`);
  return discount;
}

function reject(
  rejectedDiscounts: RejectedDiscount[],
  code: DiscountCode,
  reason: string,
): void {
  rejectedDiscounts.push({ code, reason });
}

export function executeMockScenario(
  scenario: Scenario,
  discounts: Discount[],
): ExecutionResult {
  const requested = new Set(scenario.discountCodes);
  const subtotal = getCartSubtotal(scenario.cart);
  const appliedDiscounts: DiscountCode[] = [];
  const rejectedDiscounts: RejectedDiscount[] = [];
  const notes: string[] = [];
  let productDiscount = 0;
  let orderDiscount = 0;
  let shippingDiscount = 0;

  const requestedOrderCodes = (['WELCOME10', 'SUMMER20'] as DiscountCode[]).filter((code) =>
    requested.has(code),
  );

  let selectedOrderCode: DiscountCode | undefined;
  if (requestedOrderCodes.length === 2) {
    const welcome = findDiscount(discounts, 'WELCOME10');
    const summer = findDiscount(discounts, 'SUMMER20');
    selectedOrderCode = (summer.percentage ?? 0) >= (welcome.percentage ?? 0)
      ? 'SUMMER20'
      : 'WELCOME10';
    const excludedCode = selectedOrderCode === 'SUMMER20' ? 'WELCOME10' : 'SUMMER20';
    reject(
      rejectedDiscounts,
      excludedCode,
      'Shopify allows only one order discount; the larger saving was selected.',
    );
  } else {
    selectedOrderCode = requestedOrderCodes[0];
  }

  if (requested.has('BUY2GET1')) {
    const bogo = findDiscount(discounts, 'BUY2GET1');
    const eligibleLine = scenario.cart.lines.find(
      (line) => line.sku === bogo.eligibleSku && line.quantity >= (bogo.requiredQuantity ?? 3),
    );

    if (!eligibleLine) {
      notes.push('BUY2GET1 was not eligible because the cart has fewer than 3 Classic Tees.');
    } else if (selectedOrderCode) {
      reject(
        rejectedDiscounts,
        'BUY2GET1',
        `${selectedOrderCode} is configured not to combine with product discounts.`,
      );
    } else {
      productDiscount = roundMoney(eligibleLine.unitPrice * (bogo.freeQuantity ?? 1));
      appliedDiscounts.push('BUY2GET1');
    }
  }

  if (selectedOrderCode) {
    const discount = findDiscount(discounts, selectedOrderCode);
    orderDiscount = roundMoney((subtotal - productDiscount) * ((discount.percentage ?? 0) / 100));
    appliedDiscounts.push(selectedOrderCode);
  }

  if (requested.has('FREESHIP')) {
    const freeShipping = findDiscount(discounts, 'FREESHIP');
    const postDiscountSubtotal = roundMoney(subtotal - productDiscount - orderDiscount);

    if (postDiscountSubtotal < (freeShipping.minimumSubtotal ?? 0)) {
      reject(
        rejectedDiscounts,
        'FREESHIP',
        `The configured threshold checks the post-discount subtotal ($${postDiscountSubtotal.toFixed(2)}), which is below $${freeShipping.minimumSubtotal}.`,
      );
    } else {
      shippingDiscount = scenario.cart.shippingPrice;
      appliedDiscounts.push('FREESHIP');
    }
  }

  return {
    scenarioId: scenario.id,
    subtotal,
    productDiscount,
    orderDiscount,
    shippingDiscount,
    shippingPrice: scenario.cart.shippingPrice,
    total: roundMoney(
      subtotal - productDiscount - orderDiscount + scenario.cart.shippingPrice - shippingDiscount,
    ),
    appliedDiscounts,
    rejectedDiscounts,
    notes,
  };
}

export class MockShopifyExecutionAdapter implements DiscountExecutor {
  async execute(scenario: Scenario, discounts: Discount[]): Promise<ExecutionResult> {
    return executeMockScenario(scenario, discounts);
  }
}
