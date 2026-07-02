// /api/entries CRUD + import — spec.md §9. Selection/ordering never happens
// here (this is plain storage); zod validates bodies, the db layer persists.
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";

import { entryInput, entryImport } from "@shared/schema";
import type { Db } from "../db";
import { entries } from "../db/schema";
import { generateSlug } from "../slug";

export function entriesRoutes(app: FastifyInstance, db: Db): void {
  app.get("/api/entries", async (request) => {
    const { section } = request.query as { section?: string };
    const rows = db.select().from(entries).all();
    return section ? rows.filter((row) => row.section === section) : rows;
  });

  app.post("/api/entries", async (request, reply) => {
    const parsed = entryInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }

    const input = parsed.data;
    const existingIds = new Set(db.select({ id: entries.id }).from(entries).all().map((row) => row.id));
    const id = input.id ?? generateSlug(input, existingIds);
    const now = Date.now();

    const row = { ...input, id, framings: input.framings ?? null, createdAt: now, updatedAt: now };
    db.insert(entries).values(row).run();
    return reply.code(200).send(row);
  });

  app.put<{ Params: { id: string } }>("/api/entries/:id", async (request, reply) => {
    const parsed = entryInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }

    const existing = db.select().from(entries).where(eq(entries.id, request.params.id)).get();
    if (!existing) {
      return reply.code(404).send({ error: "not_found" });
    }

    const input = parsed.data;
    const row = {
      ...input,
      id: existing.id,
      framings: input.framings ?? null,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    db.update(entries).set(row).where(eq(entries.id, existing.id)).run();
    return reply.code(200).send(row);
  });

  app.delete<{ Params: { id: string } }>("/api/entries/:id", async (request, reply) => {
    db.delete(entries).where(eq(entries.id, request.params.id)).run();
    return reply.code(200).send({ ok: true });
  });

  app.post("/api/entries/import", async (request, reply) => {
    const parsed = entryImport.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }

    const existingIds = new Set(db.select({ id: entries.id }).from(entries).all().map((row) => row.id));
    const now = Date.now();

    const rows = parsed.data.map((input) => {
      const id = input.id ?? generateSlug(input, existingIds);
      existingIds.add(id);
      return { ...input, id, framings: input.framings ?? null, createdAt: now, updatedAt: now };
    });

    db.transaction((tx) => {
      for (const row of rows) {
        tx.insert(entries)
          .values(row)
          .onConflictDoUpdate({ target: entries.id, set: row })
          .run();
      }
    });

    return reply.code(200).send({ imported: rows.length });
  });
}
