import { MockIntentParser } from '../adapters/intent-parser.ts';
import { MockShopifyAdminAdapter } from '../adapters/shopify-admin.ts';
import {
  executeMockScenario,
  MockShopifyExecutionAdapter,
} from '../adapters/shopify-execution.ts';
import { DEFAULT_EXPECTATIONS, SAMPLE_DISCOUNTS } from '../data/fixtures.ts';
import type {
  DiscountExecutor,
  DiscountReader,
  IntentParser,
  PreflightReport,
} from '../domain/types.ts';
import { generateScenarios } from './scenario-generator.ts';
import { validateScenario } from './validator.ts';

export interface PreflightDependencies {
  intentParser: IntentParser;
  discountReader: DiscountReader;
  executor: DiscountExecutor;
}

export const defaultDependencies: PreflightDependencies = {
  intentParser: new MockIntentParser(),
  discountReader: new MockShopifyAdminAdapter(),
  executor: new MockShopifyExecutionAdapter(),
};

export async function runPreflight(
  intent: string,
  dependencies: PreflightDependencies = defaultDependencies,
): Promise<PreflightReport> {
  const [expectations, discounts] = await Promise.all([
    dependencies.intentParser.parse(intent),
    dependencies.discountReader.getActiveDiscounts(),
  ]);
  const scenarios = generateScenarios(discounts);
  const executions = await Promise.all(
    scenarios.map((scenario) => dependencies.executor.execute(scenario, discounts)),
  );

  return {
    expectations,
    discounts,
    scenarios,
    results: scenarios.map((scenario, index) =>
      validateScenario(scenario, executions[index], expectations),
    ),
    generatedAt: new Date().toISOString(),
  };
}

export function buildDemoReport(): PreflightReport {
  const scenarios = generateScenarios(SAMPLE_DISCOUNTS);
  const results = scenarios.map((scenario) =>
    validateScenario(
      scenario,
      executeMockScenario(scenario, SAMPLE_DISCOUNTS),
      DEFAULT_EXPECTATIONS,
    ),
  );

  return {
    expectations: DEFAULT_EXPECTATIONS,
    discounts: SAMPLE_DISCOUNTS,
    scenarios,
    results,
    generatedAt: '2026-09-01T12:00:00.000Z',
  };
}
