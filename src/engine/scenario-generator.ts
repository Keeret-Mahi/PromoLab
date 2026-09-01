import { SAMPLE_CARTS } from '../data/fixtures.ts';
import type { CartFixture, Discount, DiscountCode, Scenario } from '../domain/types.ts';

function combinationsOfOneAndTwo(codes: DiscountCode[]): DiscountCode[][] {
  const combinations = codes.map((code) => [code]);

  for (let left = 0; left < codes.length; left += 1) {
    for (let right = left + 1; right < codes.length; right += 1) {
      combinations.push([codes[left], codes[right]]);
    }
  }

  return combinations;
}

export function generateScenarios(
  discounts: Discount[],
  carts: CartFixture[] = SAMPLE_CARTS,
): Scenario[] {
  const codes = discounts.map((discount) => discount.code).sort();
  const combinations = combinationsOfOneAndTwo(codes);
  let sequence = 0;

  return combinations.flatMap((discountCodes) =>
    carts.map((cart) => {
      sequence += 1;
      return {
        id: `scenario-${String(sequence).padStart(2, '0')}`,
        sequence,
        cart,
        discountCodes,
      };
    }),
  );
}
