import { SAMPLE_DISCOUNTS } from '../data/fixtures.ts';
import type { Discount, DiscountReader } from '../domain/types.ts';

export class MockShopifyAdminAdapter implements DiscountReader {
  async getActiveDiscounts(): Promise<Discount[]> {
    return structuredClone(SAMPLE_DISCOUNTS);
  }
}
