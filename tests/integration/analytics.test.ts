import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'radar-analytics-test-'));
process.env.PGLITE_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.DEMO_MODE;

after(() => rmSync(dir, { recursive: true, force: true }));

import { getProjectAnalytics } from '../../lib/integration/analytics-service';
import { getDb } from '../../lib/db';
import { projects, mentions } from '../../lib/db/schema';
import { eq } from 'drizzle-orm';

test('getProjectAnalytics calculates correct KPIs, sentiment distribution and source breakdown', async () => {
  const db = await getDb();

  const [testProject] = await db
    .insert(projects)
    .values({
      name: 'Analytics Test Project',
      keywords: ['analytics_kpi'],
      languages: ['en'],
    })
    .returning();

  assert.ok(testProject?.id);
  const now = new Date();

  try {
    // Insert 1 positive Reddit mention
    await db.insert(mentions).values({
      projectId: testProject.id,
      source: 'reddit',
      externalId: 'ana-1',
      content: 'Great positive outcome',
      publishedAt: new Date(now.getTime() - 24 * 3600_000),
      analyzedAt: now,
      sentiment: 'positive',
      sentimentScore: 0.8,
    });

    // Insert 1 negative Google News mention
    await db.insert(mentions).values({
      projectId: testProject.id,
      source: 'googlenews',
      externalId: 'ana-2',
      content: 'Critical concern raised',
      publishedAt: new Date(now.getTime() - 12 * 3600_000),
      analyzedAt: now,
      sentiment: 'negative',
      sentimentScore: -0.6,
    });

    // Insert 1 unanalyzed Telegram mention
    await db.insert(mentions).values({
      projectId: testProject.id,
      source: 'telegram',
      externalId: 'ana-3',
      content: 'Raw message pending analysis',
      publishedAt: new Date(now.getTime() - 6 * 3600_000),
    });

    const analytics = await getProjectAnalytics(testProject.id, 7);

    assert.equal(analytics.projectId, testProject.id);
    assert.equal(analytics.kpi.totalMentions, 3);
    assert.equal(analytics.kpi.activeSources, 3);
    assert.ok(analytics.kpi.avgSentiment !== null);
    // (0.8 + -0.6) / 2 = 0.1
    assert.ok(Math.abs(analytics.kpi.avgSentiment - 0.1) < 0.05);

    // Sentiment distribution
    assert.equal(analytics.sentimentDistribution.positive, 1);
    assert.equal(analytics.sentimentDistribution.negative, 1);
    assert.equal(analytics.sentimentDistribution.neutral, 0);
    assert.equal(analytics.sentimentDistribution.pending, 1);

    // Source breakdown
    assert.equal(analytics.sourceBreakdown.length, 3);
    const reddit = analytics.sourceBreakdown.find((s) => s.source === 'reddit');
    assert.equal(reddit?.count, 1);
  } finally {
    await db.delete(mentions).where(eq(mentions.projectId, testProject.id));
    await db.delete(projects).where(eq(projects.id, testProject.id));
  }
});
