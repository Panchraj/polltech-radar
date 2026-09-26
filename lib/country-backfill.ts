import { getDb } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { countryFromDomain, countryFromUrl } from '@/lib/country-codes';

export async function backfillCountries(projectId: number, limit = 25000): Promise<number> {
  const db = await getDb();

  const rows = (await db.execute(sql`
    SELECT id, url, author FROM mentions
    WHERE project_id = ${projectId} AND country IS NULL
      AND ((url IS NOT NULL AND url <> '') OR (author IS NOT NULL AND author <> ''))
    LIMIT ${limit}
  `)).rows as { id: number; url: string | null; author: string | null }[];
  if (!rows.length) return 0;

  const byCountry = new Map<string, number[]>();
  for (const r of rows) {
    const a2 = countryFromUrl(r.url) ?? countryFromDomain(r.author);
    if (!a2) continue;
    (byCountry.get(a2) ?? byCountry.set(a2, []).get(a2)!).push(r.id);
  }

  let done = 0;
  for (const [a2, ids] of byCountry) {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await db.execute(sql`
        UPDATE mentions SET country = ${a2}
        WHERE id IN (${sql.join(chunk.map((id) => sql`${id}`), sql`, `)})
      `);
      done += chunk.length;
    }
  }
  return done;
}
