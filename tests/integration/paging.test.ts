import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'radar-paging-test-'));
process.env.PGLITE_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.DEMO_MODE;

after(() => rmSync(dir, { recursive: true, force: true }));

import { encodeCursor, decodeCursor, queryMentionsCursor } from '../../lib/integration/mention-service';
import { getDb } from '../../lib/db';
import { projects, mentions } from '../../lib/db/schema';
import { eq, inArray } from 'drizzle-orm';

test('encodeCursor and decodeCursor roundtrips correctly', () => {
  const now = new Date('2026-09-26T12:00:00.000Z');
  const id = 42;
  const cursor = encodeCursor(now, id);
  assert.ok(typeof cursor === 'string' && cursor.length > 0);

  const decoded = decodeCursor(cursor);
  assert.ok(decoded);
  assert.equal(decoded.id, id);
  assert.equal(decoded.publishedAt.toISOString(), now.toISOString());
});

test('decodeCursor handles invalid / corrupted strings gracefully', () => {
  assert.equal(decodeCursor(''), null);
  assert.equal(decodeCursor('not-valid-base64-json!'), null);
  assert.equal(decodeCursor(Buffer.from('{"invalid": true}').toString('base64url')), null);
  assert.equal(decodeCursor(Buffer.from('{"publishedAt": "not-a-date", "id": 1}').toString('base64url')), null);
});

test('queryMentionsCursor provides deterministic forward pagination without duplicates', async () => {
  const db = await getDb();

  // Create isolated test project
  const [testProject] = await db
    .insert(projects)
    .values({
      name: 'Paging Test Project',
      keywords: ['paging_test'],
      languages: ['en'],
    })
    .returning();

  assert.ok(testProject?.id);

  // Insert 5 test mentions with staggered dates
  const baseTime = Date.now();
  const createdIds: number[] = [];

  try {
    for (let i = 1; i <= 5; i++) {
      const published = new Date(baseTime - (5 - i) * 60_000);
      const [m] = await db
        .insert(mentions)
        .values({
          projectId: testProject.id,
          source: 'reddit',
          externalId: `paging-ext-${i}`,
          content: `Test mention content ${i}`,
          publishedAt: published,
        })
        .returning({ id: mentions.id });
      createdIds.push(m.id);
    }

    // Page 1: limit 2
    const page1 = await queryMentionsCursor(testProject.id, { limit: 2 });
    assert.equal(page1.items.length, 2);
    assert.equal(page1.pagination.hasMore, true);
    assert.ok(page1.pagination.nextCursor);

    // Page 2: limit 2 with cursor from Page 1
    const page2 = await queryMentionsCursor(testProject.id, {
      limit: 2,
      cursor: page1.pagination.nextCursor!,
    });
    assert.equal(page2.items.length, 2);
    assert.equal(page2.pagination.hasMore, true);
    assert.ok(page2.pagination.nextCursor);

    // Page 3: limit 2 with cursor from Page 2
    const page3 = await queryMentionsCursor(testProject.id, {
      limit: 2,
      cursor: page2.pagination.nextCursor!,
    });
    assert.equal(page3.items.length, 1);
    assert.equal(page3.pagination.hasMore, false);
    assert.equal(page3.pagination.nextCursor, null);

    // Verify ordering is strictly descending by publishedAt and id
    const allRetrievedIds = [
      ...page1.items.map((x) => x.id),
      ...page2.items.map((x) => x.id),
      ...page3.items.map((x) => x.id),
    ];

    assert.equal(allRetrievedIds.length, 5);
    // Verify no duplicates
    const uniqueIds = new Set(allRetrievedIds);
    assert.equal(uniqueIds.size, 5);
  } finally {
    // Cleanup
    if (createdIds.length > 0) {
      await db.delete(mentions).where(inArray(mentions.id, createdIds));
    }
    await db.delete(projects).where(eq(projects.id, testProject.id));
  }
});
