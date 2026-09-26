import { sql } from 'drizzle-orm';
import { getOrGenerateCorrelationId } from '@/lib/integration/auth';
import { jsonSuccess, jsonError } from '@/lib/integration/response';
import { getDb } from '@/lib/db';
import { aiProvider } from '@/lib/ai-provider';
import { aiStatus } from '@/lib/claude';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(request: Request): Promise<Response> {
  const correlationId = getOrGenerateCorrelationId(request.headers);

  try {
    const db = await getDb();
    // Verify DB connectivity
    await db.execute(sql`SELECT 1`);

    const provider = await aiProvider().catch(() => 'unknown');
    const ai = await aiStatus().catch(() => ({
      hasKey: false,
      spend: 0,
      budget: 0,
      capReached: false,
      ready: false,
    }));

    const healthData = {
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        connected: true,
        driver: process.env.DATABASE_URL ? 'postgresql' : 'pglite',
      },
      aiEngine: {
        provider,
        ready: ai.ready,
        hasKey: ai.hasKey,
        capReached: ai.capReached,
      },
    };

    return jsonSuccess(healthData, correlationId);
  } catch (err) {
    const message = (err as Error).message ?? 'Database health check failed';
    return jsonError('INTERNAL_ERROR', message, correlationId, 500);
  }
}
