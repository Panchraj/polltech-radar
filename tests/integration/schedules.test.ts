import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'radar-schedules-test-'));
process.env.PGLITE_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.DEMO_MODE;

after(() => rmSync(dir, { recursive: true, force: true }));

import {
  listSchedules,
  saveSchedule,
  deleteSchedule,
} from '../../lib/integration/schedule-service';
import { getDb } from '../../lib/db';
import { projects } from '../../lib/db/schema';
import { eq } from 'drizzle-orm';

test('schedule service manages per-source collection schedules', async () => {
  const db = await getDb();

  const [testProject] = await db
    .insert(projects)
    .values({
      name: 'Schedule Test Project',
      keywords: ['schedule_test'],
      languages: ['en'],
    })
    .returning();

  assert.ok(testProject?.id);

  try {
    // 1. Create schedule for Reddit
    const sched1 = await saveSchedule({
      projectId: testProject.id,
      sourceCode: 'reddit',
      mode: 'interval',
      expression: '15m',
      timezone: 'UTC',
      enabled: true,
      maxRunDuration: 180,
    });

    assert.ok(sched1.id);
    assert.equal(sched1.projectId, testProject.id);
    assert.equal(sched1.sourceCode, 'reddit');
    assert.equal(sched1.mode, 'interval');
    assert.equal(sched1.expression, '15m');
    assert.equal(sched1.enabled, true);

    // 2. Create schedule for Google News
    const sched2 = await saveSchedule({
      projectId: testProject.id,
      sourceCode: 'googlenews',
      mode: 'cron',
      expression: '0 */2 * * *',
      timezone: 'Europe/Rome',
      enabled: true,
    });

    assert.ok(sched2.id);

    // 3. List schedules
    const list = await listSchedules(testProject.id);
    assert.equal(list.length, 2);

    // 4. Update Reddit schedule (disable it)
    const updated = await saveSchedule({
      projectId: testProject.id,
      sourceCode: 'reddit',
      mode: 'interval',
      enabled: false,
    });
    assert.equal(updated.id, sched1.id);
    assert.equal(updated.enabled, false);

    // 5. Delete schedule
    const deleted = await deleteSchedule(sched2.id);
    assert.equal(deleted, true);

    const remaining = await listSchedules(testProject.id);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].sourceCode, 'reddit');
  } finally {
    await db.delete(projects).where(eq(projects.id, testProject.id));
  }
});
