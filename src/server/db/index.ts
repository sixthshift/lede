// SQLite connection + migrations-on-boot + singleton seeding — spec.md §4.2.
// The only file in the schema/db layer allowed to import the native driver.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { sql } from 'drizzle-orm';

import type { Layout } from '@shared/types';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

// Full §4.2 order, all enabled — the seeded default. `[]` is only the column
// default; an empty layout would render an empty resume.
export const DEFAULT_LAYOUT: Layout = [
  { section: 'summary', enabled: true },
  { section: 'experience', enabled: true },
  { section: 'project', enabled: true },
  { section: 'skill', enabled: true },
  { section: 'education', enabled: true },
  { section: 'award', enabled: true },
  { section: 'certification', enabled: true },
  { section: 'publication', enabled: true },
  { section: 'language', enabled: true },
  { section: 'interest', enabled: true },
  { section: 'reference', enabled: true },
];

export function openDb(dataDir: string): { db: Db; sqlite: Database.Database } {
  mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(join(dataDir, 'lede.sqlite'));
  sqlite.pragma('journal_mode = WAL');
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

export function migrateDb(db: Db): void {
  migrate(db, { migrationsFolder: 'drizzle' });
}

export function seedSingletons(db: Db): void {
  const now = Date.now();
  db.run(sql`INSERT OR IGNORE INTO profile (id, updated_at) VALUES (1, ${now})`);
  db.run(sql`INSERT OR IGNORE INTO settings (id, layout, updated_at) VALUES (1, ${JSON.stringify(DEFAULT_LAYOUT)}, ${now})`);
  db.run(sql`INSERT OR IGNORE INTO secrets (id, updated_at) VALUES (1, ${now})`);
}

export function initDb(dataDir: string): { db: Db; sqlite: Database.Database } {
  const { db, sqlite } = openDb(dataDir);
  migrateDb(db);
  seedSingletons(db);
  return { db, sqlite };
}
