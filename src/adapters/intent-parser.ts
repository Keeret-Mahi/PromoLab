import { DEFAULT_EXPECTATIONS } from '../data/fixtures.ts';
import type { ExpectedPromotion, IntentParser } from '../domain/types.ts';

function extractThreshold(intent: string): number {
  const shippingPhrase = intent.match(/(?:free\s*ship\w*|shipping)[^.!?]{0,50}?\$?\s*(\d{2,4})/i);
  return shippingPhrase ? Number(shippingPhrase[1]) : 75;
}

function extractSummerPercentage(intent: string): number {
  const summerPhrase = intent.match(/(?:summer\w*|SUMMER20)[^.!?]{0,50}?(\d{1,2})\s*%/i);
  return summerPhrase ? Number(summerPhrase[1]) : 20;
}

export class MockIntentParser implements IntentParser {
  async parse(intent: string): Promise<ExpectedPromotion> {
    const threshold = extractThreshold(intent);
    const summerPercentage = extractSummerPercentage(intent);

    return {
      ...DEFAULT_EXPECTATIONS,
      summary: `Summer pricing with ${summerPercentage}% off, a $${threshold} shipping threshold, and explicit stacking rules.`,
      rules: DEFAULT_EXPECTATIONS.rules.map((rule) => {
        if (rule.id === 'summer-value') {
          return {
            ...rule,
            value: summerPercentage,
            statement: `SUMMER20 applies ${summerPercentage}% off the merchandise subtotal.`,
          };
        }
        if (rule.id === 'shipping-threshold') {
          return {
            ...rule,
            threshold,
            statement: `FREESHIP applies when the pre-discount merchandise subtotal is at least $${threshold}.`,
          };
        }
        return rule;
      }),
    };
  }
}
