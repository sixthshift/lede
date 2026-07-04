// /api/export + /api/import — full-instance backup (library + profile +
// applications), spec.md §27. A restore is an additive upsert-by-id for
// entries/applications (never a wipe) and mirrors routes/entries.ts's
// import semantics; profile is the usual singleton overwrite.
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { entryImport, profileInput, applicationCreate } from "@shared/schema";
import { SECTION_VALUES } from "@shared/sections";
import type { Db } from "../db";
import { entries, profile, applications } from "../db/schema";
import { generateSlug } from "../slug";

// TailoredResume (@shared/types) has no zod counterpart elsewhere — it's the
// server-assembled output, never a user-submitted body until now (a backup
// restore). Hand-written here rather than in shared/schema.ts, which this
// ticket doesn't own.
const jdSignalsZ = z.object({
  roleLevel: z.string(),
  weights: z.array(z.string()),
  hardRequirements: z.array(z.string()),
});

const tailoredResumeZ = z.object({
  signals: jdSignalsZ,
  summary: z.string(),
  sections: z.array(
    z.object({
      section: z.enum(SECTION_VALUES),
      groups: z.array(
        z.object({
          heading: z.string().optional(),
          leadRationale: z.string().optional(),
          items: z.array(z.object({ entryId: z.string(), text: z.string() })),
        }),
      ),
    }),
  ),
  cut: z.array(z.object({ entryId: z.string(), reason: z.string() })),
});

// A backed-up application carries its id + storage timestamps + the full
// current/locked snapshots — applicationCreate/Update (routes/applications.ts)
// only cover the user-editable subset, so this extends it for round-tripping.
const applicationImport = applicationCreate.extend({
  id: z.string().min(1),
  current: tailoredResumeZ.nullable(),
  locked: tailoredResumeZ.nullable(),
  genState: z.enum(["untailored", "tailoring", "tailored", "failed"]),
  currentMeta: z
    .object({
      at: z.number(),
      provider: z.enum(["anthropic", "openai", "google", "openai-compatible"]),
      model: z.string(),
    })
    .nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const backupImport = z.object({
  entries: entryImport.optional(),
  profile: profileInput.optional(),
  applications: z.array(applicationImport).max(500).optional(),
});

export function backupRoutes(app: FastifyInstance, db: Db): void {
  app.get("/api/export", async () => {
    const entryRows = db.select().from(entries).all();
    const {
      id: _id,
      updatedAt: _updatedAt,
      ...profileRest
    } = db.select().from(profile).where(eq(profile.id, 1)).get()!;
    const applicationRows = db.select().from(applications).all();

    return { entries: entryRows, profile: profileRest, applications: applicationRows };
  });

  app.post("/api/import", async (request, reply) => {
    const parsed = backupImport.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }

    const imported = { entries: 0, profile: 0, applications: 0 };
    const input = parsed.data;

    if (input.entries) {
      const existingIds = new Set(
        db
          .select({ id: entries.id })
          .from(entries)
          .all()
          .map((row) => row.id),
      );
      const now = Date.now();
      const rows = input.entries.map((entry) => {
        const id = entry.id ?? generateSlug(entry, existingIds);
        existingIds.add(id);
        return { ...entry, id, framings: entry.framings ?? null, createdAt: now, updatedAt: now };
      });

      db.transaction((tx) => {
        for (const row of rows) {
          tx.insert(entries).values(row).onConflictDoUpdate({ target: entries.id, set: row }).run();
        }
      });
      imported.entries = rows.length;
    }

    if (input.profile) {
      db.update(profile)
        .set({ ...input.profile, updatedAt: Date.now() })
        .where(eq(profile.id, 1))
        .run();
      imported.profile = 1;
    }

    if (input.applications) {
      const applicationRows = input.applications;
      db.transaction((tx) => {
        for (const app of applicationRows) {
          tx.insert(applications)
            .values(app)
            .onConflictDoUpdate({ target: applications.id, set: app })
            .run();
        }
      });
      imported.applications = applicationRows.length;
    }

    return reply.code(200).send({ imported });
  });
}
