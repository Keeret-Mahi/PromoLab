import type {
  AppliedDiscountAllocation,
  CreatedCartSnapshot,
  Discount,
  ExecutionResult,
  ExecutionUserError,
  ExecutionWarning,
  Scenario,
} from '../domain/types.ts';
import type {
  StorefrontCart,
  StorefrontCartWarning,
  StorefrontDiscountAllocation,
  StorefrontUserError,
} from './storefront-types.ts';

type StorefrontMutationStage = ExecutionUserError['stage'];

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function money(value: { amount: string }, label: string): number {
  const amount = Number(value.amount);
  if (!Number.isFinite(amount)) {
    throw new Error(`Shopify Storefront returned an invalid ${label} amount.`);
  }
  return amount;
}

export function normalizeStorefrontUserErrors(
  stage: StorefrontMutationStage,
  errors: StorefrontUserError[],
): ExecutionUserError[] {
  return errors.map((error) => ({
    stage,
    field: error.field ?? [],
    message: error.message,
    ...(error.code ? { code: error.code } : {}),
  }));
}

export function normalizeStorefrontWarnings(
  warnings: StorefrontCartWarning[],
): ExecutionWarning[] {
  return warnings.map((warning) => ({
    stage: 'cartCreate',
    code: warning.code,
    message: warning.message,
    target: warning.target,
  }));
}

function discountForAllocation(
  allocation: StorefrontDiscountAllocation,
  discounts: Discount[],
): Discount | undefined {
  const application = allocation.sourceDiscountApplication;
  if (application.code) {
    return discounts.find(
      (discount) => discount.code.toLowerCase() === application.code?.toLowerCase(),
    );
  }

  return discounts.find((discount) =>
    discount.title.toLowerCase() === application.title?.toLowerCase()
    || discount.code.toLowerCase() === application.title?.toLowerCase(),
  );
}

function normalizedAllocation(
  lineId: string,
  merchandiseId: string | undefined,
  allocation: StorefrontDiscountAllocation,
): AppliedDiscountAllocation {
  const application = allocation.sourceDiscountApplication;
  return {
    lineId,
    ...(merchandiseId ? { merchandiseId } : {}),
    sourceType: application.__typename,
    ...(application.code ? { code: application.code } : {}),
    ...(application.title ? { title: application.title } : {}),
    targetType: allocation.targetType,
    targetSelection: application.targetSelection,
    amount: money(allocation.discountedAmount, 'discount allocation'),
    currencyCode: allocation.discountedAmount.currencyCode,
  };
}

/** Maps Shopify-calculated cart values into the stable execution result used by PromoLab. */
export function mapStorefrontCartExecution(
  scenario: Scenario,
  discounts: Discount[],
  cart: StorefrontCart,
  userErrors: ExecutionUserError[] = [],
): ExecutionResult {
  const merchandiseSubtotal = roundMoney(cart.lines.nodes.reduce(
    (total, line) => total + money(line.cost.subtotalAmount, 'line subtotal'),
    0,
  ));
  const allocationsWithDiscounts = cart.lines.nodes.flatMap((line) =>
    line.discountAllocations.map((allocation) => ({
      allocation,
      discount: discountForAllocation(allocation, discounts),
    })),
  );
  const discountAllocations = cart.lines.nodes.flatMap((line) =>
    line.discountAllocations.map((allocation) =>
      normalizedAllocation(line.id, line.merchandise.id, allocation),
    ),
  );

  const sumCategory = (category: Discount['category']) => roundMoney(
    allocationsWithDiscounts.reduce((total, { allocation, discount }) => {
      if (discount?.category === category) {
        return total + money(allocation.discountedAmount, `${category} discount`);
      }
      if (!discount && category === 'shipping' && allocation.targetType === 'SHIPPING_LINE') {
        return total + money(allocation.discountedAmount, 'shipping discount');
      }
      if (
        !discount
        && category === 'product'
        && allocation.targetType === 'LINE_ITEM'
        && allocation.sourceDiscountApplication.targetSelection === 'ENTITLED'
      ) {
        return total + money(allocation.discountedAmount, 'product discount');
      }
      if (!discount && category === 'order' && allocation.targetType === 'LINE_ITEM') {
        return total + money(allocation.discountedAmount, 'order discount');
      }
      return total;
    }, 0),
  );

  const returnedCodes = cart.discountCodes.map(({ code, applicable }) => ({ code, applicable }));
  const returnedByCode = new Map(
    returnedCodes.map((item) => [item.code.toLowerCase(), item]),
  );
  const rejectedDiscounts = scenario.discountCodes.flatMap((code) => {
    const returned = returnedByCode.get(code.toLowerCase());
    if (returned?.applicable) return [];
    return [{
      code,
      reason: returned
        ? 'Shopify returned this discount code as not applicable to the cart.'
        : 'Shopify did not return this attempted discount code on the cart.',
    }];
  });
  const currencyCode = cart.cost.totalAmount.currencyCode;

  return {
    scenarioId: scenario.id,
    status: userErrors.length ? 'storefront_user_error' : 'completed',
    attemptedDiscountCodes: [...scenario.discountCodes],
    discountCodes: returnedCodes,
    discountAllocations,
    lines: cart.lines.nodes.map((line) => {
      const subtotal = money(line.cost.subtotalAmount, 'line subtotal');
      const total = money(line.cost.totalAmount, 'line total');
      return {
        id: line.id,
        ...(line.merchandise.id ? { merchandiseId: line.merchandise.id } : {}),
        title: line.merchandise.title ?? 'Shopify cart line',
        ...(line.merchandise.sku ? { sku: line.merchandise.sku } : {}),
        quantity: line.quantity,
        subtotal,
        total,
        discountAmount: roundMoney(
          line.discountAllocations.reduce(
            (sum, allocation) => sum + money(allocation.discountedAmount, 'line discount'),
            0,
          ),
        ),
        currencyCode: line.cost.totalAmount.currencyCode,
      };
    }),
    userErrors,
    warnings: [],
    currencyCode,
    subtotal: merchandiseSubtotal,
    productDiscount: sumCategory('product'),
    orderDiscount: sumCategory('order'),
    shippingDiscount: sumCategory('shipping'),
    shippingPrice: 0,
    total: money(cart.cost.totalAmount, 'cart total'),
    appliedDiscounts: returnedCodes.filter(({ applicable }) => applicable).map(({ code }) => code),
    rejectedDiscounts,
    notes: userErrors.map((error) => `${error.stage}: ${error.message}`),
  };
}

export function mapStorefrontCartFailure(
  scenario: Scenario,
  reason: string,
  userErrors: ExecutionUserError[],
  warnings: ExecutionWarning[] = [],
  createdCart?: CreatedCartSnapshot,
): ExecutionResult {
  return {
    scenarioId: scenario.id,
    status: userErrors.length ? 'storefront_user_error' : 'storefront_cart_error',
    attemptedDiscountCodes: [...scenario.discountCodes],
    discountCodes: [],
    discountAllocations: [],
    lines: [],
    userErrors,
    warnings,
    ...(createdCart ? { createdCart } : {}),
    currencyCode: 'CAD',
    subtotal: 0,
    productDiscount: 0,
    orderDiscount: 0,
    shippingDiscount: 0,
    shippingPrice: 0,
    total: 0,
    appliedDiscounts: [],
    rejectedDiscounts: scenario.discountCodes.map((code) => ({
      code,
      reason,
    })),
    notes: [
      reason,
      ...userErrors.map((error) => `${error.stage}: ${error.message}`),
      ...warnings.map((warning) =>
        `${warning.stage} warning ${warning.code}: ${warning.message} (target ${warning.target})`,
      ),
    ],
  };
}
