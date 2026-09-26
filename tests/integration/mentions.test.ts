import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'radar-mentions-test-'));
process.env.PGLITE_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.DEMO_MODE;

after(() => rmSync(dir, { recursive: true, force: true }));

import { queryMentionsCursor } from '../../lib/integration/mention-service';
import { getDb } from '../../lib/db';
import { projects, mentions } from '../../lib/db/schema';
import { eq, inArray } from 'drizzle-orm';

test('queryMentionsCursor filters and includes AI lineage', async () => {
  const db = await getDb();

  const [testProject] = await db
    .insert(projects)
    .values({
      name: 'Mentions Lineage Test Project',
      keywords: ['lineage_test'],
      languages: ['en'],
    })
    .returning();

  assert.ok(testProject?.id);

  const createdIds: number[] = [];
  const now = new Date();

  try {
    // 1. Unanalyzed Reddit mention
    const [m1] = await db
      .insert(mentions)
      .values({
        projectId: testProject.id,
        source: 'reddit',
        externalId: 'ext-m1',
        title: 'Reddit post title',
        content: 'Reddit content body',
        publishedAt: new Date(now.getTime() - 10_000),
      })
      .returning({ id: mentions.id });
    createdIds.push(m1.id);

    // 2. Analyzed Google News mention (positive, 5 stars)
    const [m2] = await db
      .insert(mentions)
      .values({
        projectId: testProject.id,
        source: 'googlenews',
        externalId: 'ext-m2',
        title: 'Google News article title',
        content: 'Article content snippet',
        kind: 'article',
        publishedAt: new Date(now.getTime() - 5_000),
        analyzedAt: now,
        sentiment: 'positive',
        sentimentScore: 0.85,
        emotion: 'joy',
        relevance: 5,
        relevanceReason: 'Direct major coverage',
        topics: ['news', 'tech'],
        entities: ['CompanyX'],
      })
      .returning({ id: mentions.id });
    createdIds.push(m2.id);

    // Query all for project
    const all = await queryMentionsCursor(testProject.id, {});
    assert.equal(all.items.length, 2);

    // Check lineage on analyzed mention
    const analyzedItem = all.items.find((x) => x.id === m2.id);
    assert.ok(analyzedItem);
    assert.equal(analyzedItem.kind, 'article');
    assert.equal(analyzedItem.ai.analyzed, true);
    assert.equal(analyzedItem.ai.sentiment, 'positive');
    assert.equal(analyzedItem.ai.sentimentScore, 0.85);
    assert.equal(analyzedItem.ai.emotion, 'joy');
    assert.equal(analyzedItem.ai.relevance, 5);
    assert.equal(analyzedItem.ai.relevanceReason, 'Direct major coverage');
    assert.deepEqual(analyzedItem.ai.topics, ['news', 'tech']);
    assert.deepEqual(analyzedItem.ai.entities, ['CompanyX']);

    // Check lineage on unanalyzed mention
    const unanalyzedItem = all.items.find((x) => x.id === m1.id);
    assert.ok(unanalyzedItem);
    assert.equal(unanalyzedItem.kind, 'post');
    assert.equal(unanalyzedItem.ai.analyzed, false);
    assert.equal(unanalyzedItem.ai.sentiment, null);

    // Test source filter
    const newsOnly = await queryMentionsCursor(testProject.id, { source: 'googlenews' });
    assert.equal(newsOnly.items.length, 1);
    assert.equal(newsOnly.items[0].id, m2.id);

    // Test sentiment filter
    const positiveOnly = await queryMentionsCursor(testProject.id, { sentiment: 'positive' });
    assert.equal(positiveOnly.items.length, 1);
    assert.equal(positiveOnly.items[0].id, m2.id);

    // Test relevance filter
    const highRelevance = await queryMentionsCursor(testProject.id, { minRelevance: 4 });
    assert.equal(highRelevance.items.length, 1);
    assert.equal(highRelevance.items[0].id, m2.id);

    // Test minRelevance filter excluding item
    const ultraRelevance = await queryMentionsCursor(testProject.id, { minRelevance: 6 });
    assert.equal(ultraRelevance.items.length, 2); // clamped out-of-range ignored, returns rows
  } finally {
    if (createdIds.length > 0) {
      await db.delete(mentions).where(inArray(mentions.id, createdIds));
    }
    await db.delete(projects).where(eq(projects.id, testProject.id));
  }
});
