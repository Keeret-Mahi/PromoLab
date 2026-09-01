import { runServerPreflight } from '../../../src/server/preflight.ts';

const MAX_INTENT_LENGTH = 5_000;

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { intent?: unknown };
    const intent = typeof body.intent === 'string' ? body.intent.trim() : '';

    if (!intent) {
      return Response.json({ error: 'Promotion intent is required.' }, { status: 400 });
    }
    if (intent.length > MAX_INTENT_LENGTH) {
      return Response.json(
        { error: `Promotion intent must be ${MAX_INTENT_LENGTH} characters or fewer.` },
        { status: 400 },
      );
    }

    return Response.json(await runServerPreflight(intent));
  } catch {
    // Keep server configuration and upstream Shopify details out of browser responses.
    return Response.json(
      { error: 'The preflight service is temporarily unavailable.' },
      { status: 500 },
    );
  }
}
