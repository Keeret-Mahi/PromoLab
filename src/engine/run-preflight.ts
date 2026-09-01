import type {
  Discount,
  DiscountExecutor,
  DiscountReader,
  ExpectedPromotion,
  IntentParser,
  PreflightReport,
  PreflightRuntime,
} from '../domain/types.ts';
import { generateScenarios } from './scenario-generator.ts';
import { validateScenario } from './validator.ts';

export interface PreflightDependencies {
  intentParser: IntentParser;
  discountReader: DiscountReader;
  executor: DiscountExecutor;
  runtime?: PreflightRuntime;
}

const DEFAULT_RUNTIME: PreflightRuntime = {
  dataMode: 'mock',
  executionMode: 'mock',
};

export async function runPreflight(
  intent: string,
  dependencies: PreflightDependencies,
): Promise<PreflightReport> {
  const [expectations, discounts] = await Promise.all([
    dependencies.intentParser.parse(intent),
    dependencies.discountReader.getActiveDiscounts(),
  ]);
  const scenarios = generateScenarios(discounts);
  const executions = await Promise.all(
    scenarios.map((scenario) => dependencies.executor.execute(scenario, discounts)),
  );

  return buildPreflightReport(
    expectations,
    discounts,
    scenarios,
    executions,
    dependencies.runtime,
  );
}

export function buildPreflightReport(
  expectations: ExpectedPromotion,
  discounts: Discount[],
  scenarios = generateScenarios(discounts),
  executions: Awaited<ReturnType<DiscountExecutor['execute']>>[] = [],
  runtime: PreflightRuntime = DEFAULT_RUNTIME,
): PreflightReport {
  if (executions.length !== scenarios.length) {
    throw new Error('Each generated scenario requires one execution result.');
  }

  return {
    expectations,
    discounts,
    scenarios,
    results: scenarios.map((scenario, index) =>
      validateScenario(scenario, executions[index], expectations),
    ),
    runtime,
    generatedAt: new Date().toISOString(),
  };
}
