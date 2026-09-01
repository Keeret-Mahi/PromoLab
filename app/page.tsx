import PromoLabApp from '../src/components/PromoLabApp.tsx';
import { DEFAULT_PROMPT } from '../src/data/fixtures.ts';
import { runServerPreflight } from '../src/server/preflight.ts';

export default async function Home() {
  const initialReport = await runServerPreflight(DEFAULT_PROMPT);
  return <PromoLabApp initialReport={initialReport} />;
}
