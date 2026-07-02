// Phase 0 seed data — spec.md §22 (verbatim). Loaded if `entries` empty on first run.
import type { Entry } from '@shared/types';
import type { Db } from './db';
import { entries } from './db/schema';

export const SEED_ENTRIES: Entry[] = [
  { id: 'cloudcase-rules-engine', section: 'experience', sortKey: 202101,
    meta: { section: 'experience', company: 'Cloudcase', role: 'Senior → Principal SWE', period: '2021–present' },
    facts: [
      'rules engine ~30k lines of unstructured rules',
      'devs spent ~50% of time navigating the codebase',
      'built a lifecycle framework: schemas, lifecycle mgmt, consistent patterns',
      'onboarding dropped from days to 1 day; bug incidence fell',
    ],
    tags: ['platform-arch', 'delivery'],
    framings: ['built a lifecycle framework that cut onboarding from days to one day'] },
  { id: 'cloudcase-frontend-rewrite', section: 'experience', sortKey: 202501,
    meta: { section: 'experience', company: 'Cloudcase', role: 'Senior → Principal SWE', period: '2021–present' },
    facts: [
      'replaced legacy jQuery with a three-layer React/TypeScript architecture',
      'component library + platform SDK + React app',
      'team now ships all feature work on it',
    ],
    tags: ['platform-arch', 'frontend'] },
  { id: 'cloudcase-platform-sdk', section: 'experience', sortKey: 202503,
    meta: { section: 'experience', company: 'Cloudcase', role: 'Senior → Principal SWE', period: '2021–present' },
    facts: [
      'built a platform SDK exposing the platform programmatically for the first time',
      'adopted across all internal project teams',
      'now the integration path offered to new external clients',
    ],
    tags: ['platform-arch', 'sdk'] },
];

// First-boot seeding (§22): if `entries` is empty, load SEED_ENTRIES. Idempotent —
// safe to call on every boot; only acts once (until entries are added/removed down to 0).
export function seedIfEmpty(db: Db): void {
  const count = db.select().from(entries).all().length;
  if (count > 0) return;

  const now = Date.now();
  db.transaction((tx) => {
    for (const entry of SEED_ENTRIES) {
      tx.insert(entries)
        .values({ ...entry, framings: entry.framings ?? null, createdAt: now, updatedAt: now })
        .run();
    }
  });
}
