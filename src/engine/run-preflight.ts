import type {
  Discount,
  DiscountExecutor,
  DiscountReader,
  ExpectedPromotion,
  IntentParser,
  PreflightReport,
  PreflightRuntime,
  Scenario,
} from '../domain/types.ts';
import { generateScenarios } from './scenario-generator.ts';
import { validateScenario } from './validator.ts';

export interface PreflightDependencies {
  intentParser: IntentParser;
  discountReader: DiscountReader;
  executor: DiscountExecutor;
  runtime?: PreflightRuntime;
  scenarioBuilder?: (discounts: Discount[]) => Scenario[] | Promise<Scenario[]>;
}

const DEFAULT_RUNTIME: PreflightRuntime = {
  dataMode: 'mock',
  executionMode: 'mock',
};

export async function runPreflight(
  intent: string,
  dependencies: PreflightDependencies,
): Promise<PreflightReport> {
  const { expectations, discounts, scenarios } = await preparePreflightInputs(
    intent,
    dependencies,
  );
  const executions = dependencies.runtime?.executionMode === 'live'
    ? dependencies.executor.executeScenarios
      ? await dependencies.executor.executeScenarios(scenarios, discounts)
      : await executeSequentially(scenarios, discounts, dependencies.executor)
    : await Promise.all(
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

export async function preparePreflight(
  intent: string,
  dependencies: PreflightDependencies,
): Promise<PreflightReport> {
  const { expectations, discounts, scenarios } = await preparePreflightInputs(
    intent,
    dependencies,
  );
  return {
    expectations,
    discounts,
    scenarios,
    results: [],
    runtime: dependencies.runtime ?? DEFAULT_RUNTIME,
    generatedAt: new Date().toISOString(),
  };
}

async function preparePreflightInputs(
  intent: string,
  dependencies: PreflightDependencies,
): Promise<{
  expectations: ExpectedPromotion;
  discounts: Discount[];
  scenarios: Scenario[];
}> {
  const [expectations, discounts] = await Promise.all([
    dependencies.intentParser.parse(intent),
    dependencies.discountReader.getActiveDiscounts(),
  ]);
  const scenarios = dependencies.scenarioBuilder
    ? await dependencies.scenarioBuilder(discounts)
    : generateScenarios(discounts);
  return { expectations, discounts, scenarios };
}

async function executeSequentially(
  scenarios: Scenario[],
  discounts: Discount[],
  executor: DiscountExecutor,
): Promise<Awaited<ReturnType<DiscountExecutor['execute']>>[]> {
  const executions: Awaited<ReturnType<DiscountExecutor['execute']>>[] = [];
  for (const scenario of scenarios) {
    executions.push(await executor.execute(scenario, discounts));
  }
  return executions;
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
      validateScenario(scenario, executions[index], expectations, discounts),
    ),
    runtime,
    generatedAt: new Date().toISOString(),
  };
}
