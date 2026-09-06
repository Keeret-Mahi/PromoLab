import { DEFAULT_EXPECTATIONS } from '../data/fixtures.ts';
import type { ExpectedPromotion, IntentParser } from '../domain/types.ts';

function extractSummerPercentage(intent: string): number {
  const summerPhrase = intent.match(/(?:summer\w*|SUMMER20)[^.!?]{0,50}?(\d{1,2})\s*%/i);
  return summerPhrase ? Number(summerPhrase[1]) : 20;
}

export class MockIntentParser implements IntentParser {
  async parse(intent: string): Promise<ExpectedPromotion> {
    const summerPercentage = extractSummerPercentage(intent);

    return {
      ...DEFAULT_EXPECTATIONS,
      summary: `${summerPercentage}% off eligible products with explicit SUMMER20 and WELCOME10 incompatibility.`,
      rules: DEFAULT_EXPECTATIONS.rules.map((rule) => {
        if (rule.id === 'summer-value') {
          return {
            ...rule,
            value: summerPercentage,
            statement: `SUMMER20 applies ${summerPercentage}% off eligible products.`,
          };
        }
        return rule;
      }),
    };
  }
}
