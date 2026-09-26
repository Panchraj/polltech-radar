import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'radar-projects-test-'));
process.env.PGLITE_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.DEMO_MODE;

after(() => rmSync(dir, { recursive: true, force: true }));

import {
  createProject,
  getProject,
  getProjectByMonitoringId,
  listProjects,
  updateProject,
  deleteProject,
} from '../../lib/integration/project-service';
import type { QueryPlan } from '../../lib/query-plan';

test('createProject provisions project deterministically with monitoringId without AI', async () => {
  const monitoringId = 'polltech-mon-777';
  const created = await createProject({
    name: 'Election Sentiment Watch 2026',
    monitoringId,
    active: true,
    keywords: ['voter turnout', 'polling station'],
    allTerms: ['regional election'],
    excludeTerms: ['astrology', 'gaming'],
    languages: ['en', 'it'],
    countries: ['IT'],
    semanticContext: 'Monitoring public debate around regional administrative elections',
    benchmarkEntities: [
      { name: 'Coalition A', keywords: ['Party Alpha', 'Leader A'] },
      { name: 'Coalition B', keywords: ['Party Beta', 'Leader B'] },
    ],
  });

  assert.ok(created.id);
  assert.equal(created.name, 'Election Sentiment Watch 2026');
  assert.equal(created.monitoringId, monitoringId);
  assert.equal(created.active, true);
  assert.deepEqual(created.keywords, ['voter turnout', 'polling station']);
  assert.deepEqual(created.allTerms, ['regional election']);
  assert.deepEqual(created.excludeTerms, ['astrology', 'gaming']);
  assert.deepEqual(created.languages, ['en', 'it']);

  // Validate deterministic QueryPlan was built without AI
  assert.ok(created.queryPlan);
  const plan = created.queryPlan as QueryPlan;
  assert.equal(plan.version, 1);
  assert.equal(plan.origin, 'legacy'); // Proves deterministic generation without AI
  assert.ok(plan.concepts.length >= 2);
  assert.ok(plan.queries.length >= 2);

  // Test getProject
  const fetched = await getProject(created.id);
  assert.ok(fetched);
  assert.equal(fetched.id, created.id);
  assert.equal(fetched.monitoringId, monitoringId);

  // Test getProjectByMonitoringId
  const byMon = await getProjectByMonitoringId(monitoringId);
  assert.ok(byMon);
  assert.equal(byMon.id, created.id);

  // Test listProjects with filter
  const list = await listProjects({ monitoringId });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, created.id);

  // Test updateProject: change active to false and add keyword
  const updated = await updateProject(created.id, {
    active: false,
    keywords: ['voter turnout', 'polling station', 'absentee ballot'],
  });
  assert.ok(updated);
  assert.equal(updated.active, false);
  assert.deepEqual(updated.keywords, ['voter turnout', 'polling station', 'absentee ballot']);

  // Verify plan recompiled with new keyword
  const updatedPlan = updated.queryPlan as QueryPlan;
  const subjectConcept = updatedPlan.concepts.find((c) => c.role === 'subject');
  assert.ok(subjectConcept?.terms.includes('absentee ballot'));

  // Test deleteProject
  const deleted = await deleteProject(created.id);
  assert.equal(deleted, true);

  const missing = await getProject(created.id);
  assert.equal(missing, null);
});
