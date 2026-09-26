import { and, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { mentions } from '@/lib/db/schema';
import { normSentimentValue } from '@/lib/data';
import type { AnalyticsSummaryResponse } from './types';

export async function getProjectAnalytics(
  projectId: number,
  windowDays = 30,
): Promise<AnalyticsSummaryResponse> {
  const db = await getDb();
  const safeDays = Math.min(Math.max(windowDays, 1), 365);
  const since = new Date(Date.now() - safeDays * 86400_000);

  // 1. KPI summary
  const [kpi] = await db
    .select({
      total: sql<number>`count(*)`,
      avgSentiment: sql<number | null>`avg(${mentions.sentimentScore})`,
      sources: sql<number>`count(DISTINCT ${mentions.source})`,
    })
    .from(mentions)
    .where(and(eq(mentions.projectId, projectId), gte(mentions.publishedAt, since)));

  // 2. Sentiment distribution
  const sentimentRaw = await db
    .select({
      sentiment: mentions.sentiment,
      analyzedAt: mentions.analyzedAt,
      n: sql<number>`count(*)`,
    })
    .from(mentions)
    .where(and(eq(mentions.projectId, projectId), gte(mentions.publishedAt, since)))
    .groupBy(mentions.sentiment, mentions.analyzedAt);

  const distribution = {
    positive: 0,
    neutral: 0,
    negative: 0,
    pending: 0,
  };

  for (const r of sentimentRaw) {
    const count = Number(r.n);
    if (!r.analyzedAt && !r.sentiment) {
      distribution.pending += count;
    } else {
      const canonical = normSentimentValue(r.sentiment);
      distribution[canonical] += count;
    }
  }

  // 3. Volume by day & source
  const volumeResult = await db.execute(sql`
    SELECT to_char(date_trunc('day', published_at), 'YYYY-MM-DD') AS day, source, count(*) AS n
    FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${since.toISOString()}::timestamptz
    GROUP BY 1, 2 ORDER BY 1
  `);

  const volumeByDay = (volumeResult.rows as Array<{ day: string; source: string; n: string | number }>).map(
    (row) => ({
      day: row.day,
      source: row.source,
      count: Number(row.n),
    }),
  );

  // 4. Top topics
  let topTopics: Array<{ topic: string; count: number }> = [];
  try {
    const topicsResult = await db.execute(sql`
      SELECT t AS topic, count(*) AS n
      FROM mentions, jsonb_array_elements_text(topics) AS t
      WHERE project_id = ${projectId} AND published_at >= ${since.toISOString()}::timestamptz
      GROUP BY t ORDER BY n DESC LIMIT 15
    `);
    topTopics = (topicsResult.rows as Array<{ topic: string; n: string | number }>).map((row) => ({
      topic: row.topic,
      count: Number(row.n),
    }));
  } catch {
    // If jsonb_array_elements_text is unsupported on certain drivers/empty datasets, gracefully fall back
    topTopics = [];
  }

  // 5. Source breakdown
  const sourceRows = await db
    .select({
      source: mentions.source,
      count: sql<number>`count(*)`,
    })
    .from(mentions)
    .where(and(eq(mentions.projectId, projectId), gte(mentions.publishedAt, since)))
    .groupBy(mentions.source)
    .orderBy(desc(sql`count(*)`));

  const sourceBreakdown = sourceRows.map((r) => ({
    source: r.source,
    count: Number(r.count),
  }));

  return {
    projectId,
    windowDays: safeDays,
    kpi: {
      totalMentions: Number(kpi?.total ?? 0),
      avgSentiment: kpi?.avgSentiment !== null && kpi?.avgSentiment !== undefined ? Number(kpi.avgSentiment) : null,
      activeSources: Number(kpi?.sources ?? 0),
    },
    sentimentDistribution: distribution,
    volumeByDay,
    topTopics,
    sourceBreakdown,
  };
}
