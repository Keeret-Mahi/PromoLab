import PromoLabApp from '../src/components/PromoLabApp.tsx';
import { DEFAULT_PROMPT } from '../src/data/fixtures.ts';
import { prepareServerPreflight } from '../src/server/preflight.ts';

export default async function Home() {
  const initialReport = await prepareServerPreflight(DEFAULT_PROMPT);
  return <PromoLabApp initialReport={initialReport} />;
}
