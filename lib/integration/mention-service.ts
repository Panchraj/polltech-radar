import { and, desc, eq, gte, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { mentions } from '@/lib/db/schema';
import { normSentimentValue } from '@/lib/data';
import { aiProvider, aiModels, type AiProviderId } from '@/lib/ai-provider';
import type {
  CursorPaginationParams,
  CursorPaginationResult,
  CursorPayload,
  MentionExportItem,
  MentionAiLineage,
} from './types';

/**
 * Encodes a (publishedAt, id) tuple into an opaque URL-safe base64 cursor.
 */
export function encodeCursor(publishedAt: Date | string, id: number): string {
  const ts = typeof publishedAt === 'string' ? publishedAt : publishedAt.toISOString();
  const payload: CursorPayload = { publishedAt: ts, id };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Decodes an opaque base64 cursor into a (publishedAt, id) tuple.
 */
export function decodeCursor(cursor: string): { publishedAt: Date; id: number } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as Partial<CursorPayload>;
    if (!parsed || typeof parsed.publishedAt !== 'string' || typeof parsed.id !== 'number') {
      return null;
    }
    const d = new Date(parsed.publishedAt);
    if (Number.isNaN(d.getTime())) return null;
    return { publishedAt: d, id: parsed.id };
  } catch {
    return null;
  }
}

/**
 * Executes a deterministic cursor-paginated query for mentions under a given project.
 */
export async function queryMentionsCursor(
  projectId: number,
  params: CursorPaginationParams,
): Promise<CursorPaginationResult<MentionExportItem>> {
  const db = await getDb();
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);

  const conds: SQL[] = [eq(mentions.projectId, projectId)];

  if (params.cursor) {
    const decoded = decodeCursor(params.cursor);
    if (decoded) {
      // Deterministic tuple comparison: (published_at < ts) OR (published_at = ts AND id < id)
      const cursorCond = or(
        lt(mentions.publishedAt, decoded.publishedAt),
        and(eq(mentions.publishedAt, decoded.publishedAt), lt(mentions.id, decoded.id)),
      );
      if (cursorCond) conds.push(cursorCond);
    }
  }

  if (params.since) {
    const sinceDate = new Date(params.since);
    if (!Number.isNaN(sinceDate.getTime())) {
      conds.push(gte(mentions.publishedAt, sinceDate));
    }
  }

  if (params.source) {
    conds.push(eq(mentions.source, params.source.toLowerCase().trim()));
  }

  if (params.sentiment) {
    conds.push(eq(mentions.sentiment, params.sentiment));
  }

  if (params.kind) {
    conds.push(eq(mentions.kind, params.kind));
  }

  if (params.minRelevance && params.minRelevance >= 1 && params.minRelevance <= 5) {
    conds.push(gte(mentions.relevance, params.minRelevance));
  }

  const where = and(...conds);

  // Fetch limit + 1 to determine if next page exists
  const rows = await db
    .select()
    .from(mentions)
    .where(where)
    .orderBy(desc(mentions.publishedAt), desc(mentions.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const itemsToReturn = hasMore ? rows.slice(0, limit) : rows;

  // Retrieve active AI provider metadata for lineage
  const currentProvider = (await aiProvider().catch(() => 'anthropic')) as AiProviderId;
  const currentModels = await aiModels(currentProvider).catch(() => ({ fast: 'claude-haiku-4-5', smart: 'claude-sonnet-4-6' }));

  const items: MentionExportItem[] = itemsToReturn.map((m) => {
    const isAnalyzed = Boolean(m.analyzedAt);

    const ai: MentionAiLineage = {
      analyzed: isAnalyzed,
      provider: isAnalyzed ? currentProvider : undefined,
      model: isAnalyzed ? currentModels.fast : undefined,
      analyzedAt: m.analyzedAt ? m.analyzedAt.toISOString() : null,
      sentiment: m.sentiment ? normSentimentValue(m.sentiment) : null,
      sentimentScore: m.sentimentScore ?? null,
      emotion: m.emotion ?? null,
      relevance: m.relevance ?? null,
      relevanceReason: m.relevanceReason ?? null,
      topics: m.topics ?? [],
      entities: m.entities ?? [],
    };

    return {
      id: m.id,
      externalId: m.externalId,
      source: m.source,
      kind: (m.kind as 'article' | 'post') ?? 'post',
      url: m.url ?? null,
      title: m.title ?? null,
      content: m.content,
      articleText: m.articleText ?? null,
      author: m.author ?? null,
      authorHandle: m.authorHandle ?? null,
      community: m.community ?? null,
      publishedAt: m.publishedAt.toISOString(),
      fetchedAt: m.fetchedAt.toISOString(),
      language: m.language ?? null,
      country: m.country ?? null,
      engagement: m.engagement ?? null,
      engagementScore: m.engagementScore ?? 0,
      reach: m.reach ?? null,
      queryIds: m.queryIds ?? [],
      ai,
    };
  });

  const lastItem = itemsToReturn[itemsToReturn.length - 1];
  const nextCursor = hasMore && lastItem ? encodeCursor(lastItem.publishedAt, lastItem.id) : null;

  return {
    items,
    pagination: {
      nextCursor,
      hasMore,
      limit,
    },
  };
}
