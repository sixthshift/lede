// Phase 0 seed data — spec.md §22 (verbatim). Loaded if `entries` empty on first run.
import type { Entry } from '@shared/types';

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
