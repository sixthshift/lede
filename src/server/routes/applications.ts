// /api/applications CRUD — spec.md §27. A tailoring record for one job, NOT
// a hiring tracker (no status field). Mirrors routes/entries.ts's idiom.
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { applicationCreate, applicationUpdate } from "@shared/schema";
import type { Db } from "../db";
import { applications } from "../db/schema";

// The LIST payload omits the heavy current/locked TailoredResume snapshots
// (§9 "no heavy snapshots") — only metadata + genState + currentMeta.
const LIST_COLUMNS = {
  id: applications.id,
  company: applications.company,
  role: applications.role,
  jobDescription: applications.jobDescription,
  context: applications.context,
  genState: applications.genState,
  currentMeta: applications.currentMeta,
  createdAt: applications.createdAt,
  updatedAt: applications.updatedAt,
} as const;

export function applicationsRoutes(app: FastifyInstance, db: Db): void {
  app.get("/api/applications", async () => {
    return db.select(LIST_COLUMNS).from(applications).all();
  });

  app.post("/api/applications", async (request, reply) => {
    const parsed = applicationCreate.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }

    const input = parsed.data;
    const now = Date.now();
    const row = {
      id: randomUUID(),
      company: input.company ?? null,
      role: input.role ?? null,
      jobDescription: input.jobDescription,
      context: input.context ?? null,
      current: null,
      locked: null,
      genState: "untailored" as const,
      currentMeta: null,
      createdAt: now,
      updatedAt: now,
    };
    db.insert(applications).values(row).run();
    return reply.code(200).send(row);
  });

  app.get<{ Params: { id: string } }>("/api/applications/:id", async (request, reply) => {
    const row = db.select().from(applications).where(eq(applications.id, request.params.id)).get();
    if (!row) {
      return reply.code(404).send({ error: "not_found" });
    }
    return row;
  });

  app.put<{ Params: { id: string } }>("/api/applications/:id", async (request, reply) => {
    const parsed = applicationUpdate.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }

    const existing = db
      .select()
      .from(applications)
      .where(eq(applications.id, request.params.id))
      .get();
    if (!existing) {
      return reply.code(404).send({ error: "not_found" });
    }

    const input = parsed.data;
    const row = {
      ...existing,
      ...(input.company !== undefined ? { company: input.company ?? null } : {}),
      ...(input.role !== undefined ? { role: input.role ?? null } : {}),
      ...(input.jobDescription !== undefined ? { jobDescription: input.jobDescription } : {}),
      ...(input.context !== undefined ? { context: input.context ?? null } : {}),
      updatedAt: Date.now(),
    };
    db.update(applications).set(row).where(eq(applications.id, existing.id)).run();
    return reply.code(200).send(row);
  });

  app.delete<{ Params: { id: string } }>("/api/applications/:id", async (request, reply) => {
    db.delete(applications).where(eq(applications.id, request.params.id)).run();
    return reply.code(200).send({ ok: true });
  });
}
