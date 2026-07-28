// /api/applications CRUD — spec.md §27. A tailoring record for one job, NOT
// a hiring tracker (no status field). Mirrors routes/entries.ts's idiom.
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { APICallError, NoObjectGeneratedError } from "ai";

import {
  applicationCreate,
  applicationUpdate,
  documentFormatZ,
  resumePartPatchZ,
  letterPartPatchZ,
  letterParagraphInsertZ,
  letterParagraphRemoveZ,
  VOICE_SOURCES_CAP,
} from "@shared/schema";
import { resolveStoredFormat } from "@shared/format-v2";
import { plainText } from "@shared/plainText";
import type {
  CoverLetter,
  Entry,
  Profile,
  ProviderId,
  Section,
  TailoredResume,
  VoiceSource,
} from "@shared/types";
import type { Db } from "../db";
import { applications, entries, profile, settings, secrets } from "../db/schema";
import { loadConfig, type Config } from "../config";
import { decrypt } from "../crypto";
import {
  FixtureEngine,
  ProviderEngine,
  NoFixtureError,
  tailor,
  type TailorEngine,
} from "../tailor/engine";
import { CLAUDE_CLI_ERRORS, ClaudeCliEngine, ClaudeCliError } from "../tailor/claude-cli";
import { DecisionContractError, FabricationError } from "../tailor/validate";
import { deriveContentBudget } from "../tailor/budget";
import { tailorLetter } from "../tailor/letter";

// Row -> domain Entry — same shape/key-order as index.ts's rowToEntry, kept
// in lockstep so hashKey() (FixtureEngine's replay key) matches identically
// regardless of which route read the entries from the db.
function rowToEntry(row: typeof entries.$inferSelect): Entry {
  const entry: Entry = {
    id: row.id,
    section: row.section as Section,
    sortKey: row.sortKey,
    meta: row.meta,
    facts: row.facts,
    tags: row.tags,
  };
  if (row.framings) entry.framings = row.framings;
  return entry;
}

// Row -> domain Profile — the db column set carries nulls for unset optional
// fields (drizzle's nullable column convention); Profile's optional fields
// are `undefined`-shaped instead, so this mirrors rowToEntry's row->domain
// adapter to bridge that at the one call site (flag-voice) that needs a real
// Profile to hand plainText, rather than passing the raw row through.
function rowToProfile(row: typeof profile.$inferSelect): Profile {
  const p: Profile = {
    name: row.name,
    email: row.email,
    links: row.links,
    voiceSources: row.voiceSources,
  };
  if (row.headline) p.headline = row.headline;
  if (row.phone) p.phone = row.phone;
  if (row.location) p.location = row.location;
  if (row.baseSummary) p.baseSummary = row.baseSummary;
  if (row.photoUrl) p.photoUrl = row.photoUrl;
  return p;
}

// voiceSources -> the one voice block both /tailor and /generate-letter ride
// on the user message (T43). No sources ⇒ undefined, never an empty-string
// block — that's what keeps the byte-identity guard (buildUserPrompt /
// buildLetterUserPrompt's `!voice` short-circuit) intact for the common case.
function voicePrompt(sources: VoiceSource[]): string | undefined {
  if (sources.length === 0) return undefined;
  return sources.map((s) => s.text).join("\n\n---\n\n");
}

// Maps a tailor() failure to its distinct HTTP status — identical to
// index.ts's mapTailorError for the stateless route (spec.md §9).
function mapTailorError(err: unknown): { status: number; body: { error: string } } {
  if (err instanceof NoFixtureError) return { status: 422, body: { error: "no_fixture" } };
  if (err instanceof FabricationError) return { status: 502, body: { error: "fabrication" } };
  // The model returned a structurally well-formed but contract-violating
  // decision (bad partition/rank, or a missing lede rationale) — distinct
  // from fabrication (502) and no_fixture (422): 424 signals the failure is
  // downstream of a dependency (the model's decision) that didn't hold up,
  // not a malformed client request or a transport-level provider failure.
  if (err instanceof DecisionContractError)
    return { status: 424, body: { error: "decision_contract" } };

  // 502 across all four: the local `claude` is this engine's upstream, so every
  // way it can fail is a bad gateway. The body carries only the code's fixed
  // string — never the error's own message, which ends in the child's
  // (redacted, bounded) output tail and has no business in an HTTP response.
  if (err instanceof ClaudeCliError)
    return { status: 502, body: { error: CLAUDE_CLI_ERRORS[err.code] } };

  if (APICallError.isInstance(err)) {
    if (err.statusCode === 401 || err.statusCode === 403)
      return { status: 401, body: { error: "key_invalid" } };
    if (err.statusCode === 429) return { status: 429, body: { error: "rate_limited" } };
    return { status: 502, body: { error: "provider_error" } };
  }

  if (NoObjectGeneratedError.isInstance(err))
    return { status: 502, body: { error: "model_off_contract" } };

  return { status: 502, body: { error: "provider_error" } };
}

// Resolves a resumePartPatchZ path against a TailoredResume and returns a
// resume with ONLY that part's text replaced — a fresh object, never a
// mutation of the input (structuredClone at the call site handles the
// snapshot-isolation half; this half handles "which one string changes").
// Returns null when the path doesn't resolve (unknown section/removed group/
// index past the end) — the route turns that into 400, never a silent
// append or no-op 200.
function applyResumePartPatch(
  resume: TailoredResume,
  path: { kind: "summary" } | { kind: "item"; section: Section; group: number; index: number },
  text: string,
): TailoredResume | null {
  if (path.kind === "summary") {
    return { ...resume, summary: text };
  }

  const sectionIndex = resume.sections.findIndex((s) => s.section === path.section);
  if (sectionIndex === -1) return null;
  const group = resume.sections[sectionIndex]!.groups[path.group];
  if (!group) return null;
  if (!group.items[path.index]) return null;

  return {
    ...resume,
    sections: resume.sections.map((section, si) => {
      if (si !== sectionIndex) return section;
      return {
        ...section,
        groups: section.groups.map((g, gi) => {
          if (gi !== path.group) return g;
          return {
            ...g,
            items: g.items.map((item, ii) => (ii === path.index ? { ...item, text } : item)),
          };
        }),
      };
    }),
  };
}

// Resolves a letterPartPatchZ path against a CoverLetter and returns a
// letter with ONLY that part's text replaced — a fresh object, never a
// mutation of the input. Editing a body paragraph preserves its groundedOn
// untouched (mirrors applyResumePartPatch's text-only-replacement contract).
// Returns null when the path doesn't resolve (body index past the end) —
// the route turns that into 400.
function applyLetterPartPatch(
  letter: CoverLetter,
  path: { kind: "greeting" } | { kind: "body"; index: number } | { kind: "closing" },
  text: string,
): CoverLetter | null {
  if (path.kind === "greeting") return { ...letter, greeting: text };
  if (path.kind === "closing") return { ...letter, closing: text };

  if (!letter.body[path.index]) return null;
  return {
    ...letter,
    body: letter.body.map((paragraph, i) =>
      i === path.index ? { ...paragraph, text } : paragraph,
    ),
  };
}

// Inserts a new hand-authored body paragraph at `position` (0..body.length,
// inclusive — position === body.length appends). ALWAYS stores
// `groundedOn: []` regardless of whatever the client's request carried under
// that key (letterParagraphInsertZ declares it only so a client isn't 400'd
// for a field that mirrors CoverLetter's own shape) — a hand-added paragraph
// is authored, not validated, and can never launder a fabricated groundedOn
// claim through this path. Returns null when position is out of range.
function insertLetterParagraph(
  letter: CoverLetter,
  position: number,
  text: string,
): CoverLetter | null {
  if (position > letter.body.length) return null;
  const body = letter.body.slice();
  body.splice(position, 0, { text, groundedOn: [] });
  return { ...letter, body };
}

// Removes the body paragraph at `index`. Returns null when out of range.
function removeLetterParagraph(letter: CoverLetter, index: number): CoverLetter | null {
  if (!letter.body[index]) return null;
  const body = letter.body.slice();
  body.splice(index, 1);
  return { ...letter, body };
}

// applicationCreate/Update (@shared/schema) don't own DocumentFormat —
// extended here with the bounded documentFormatZ validator (§28.3).
const applicationCreateWithFormat = applicationCreate.extend({ format: documentFormatZ.nullish() });
const applicationUpdateWithFormat = applicationUpdate.extend({ format: documentFormatZ.nullish() });

// ── T42 flag-voice body — the ONLY door into profile.voiceSources. .strict()
// so an unknown kind (e.g. a cut 'other') is a 400, not silently ignored. ──
const flagVoiceBodyZ = z.object({ kind: z.enum(["cover-letter", "resume"]) }).strict();

// Joins a CoverLetter's parts into one prose string — greeting, each body
// paragraph's text, then closing — the same deterministic join every flag
// call produces, so the resulting voice source reads as one letter's prose
// rather than a structural dump of {greeting,body,closing}.
function letterProse(letter: CoverLetter): string {
  return [letter.greeting, ...letter.body.map((paragraph) => paragraph.text), letter.closing].join(
    "\n\n",
  );
}

// ── stored-format read boundary (§31.1 migration, ticket E9-F0d2) ──
// A pre-cutover database may still hold v1 JSON in these two nullable
// columns (settings.defaultFormat is gated at its own read site,
// routes/settings.ts's currentSettings). Lazy-on-read, no boot-time table
// rewrite: every site below that can expose an application row to a client
// runs it through here first. Idempotent via resolveStoredFormat's
// isFormatV2 short-circuit, so a genuine v2 value passes through untouched.
// A subsequent write (PUT/tailor/lock all write the merged row back) then
// naturally persists the migrated v2 value — no separate write-back step.
type ApplicationRow = typeof applications.$inferSelect;
export function migrateStoredApplicationFormats(row: ApplicationRow): ApplicationRow {
  return {
    ...row,
    format: row.format === null ? null : resolveStoredFormat(row.format),
    lockedFormat:
      row.lockedFormat === null
        ? null
        : { ...row.lockedFormat, format: resolveStoredFormat(row.lockedFormat.format) },
  };
}

export type ApplicationsRoutesDeps = {
  // Test-only seam (mirrors settingsRoutes' injected validator): a fixed
  // engine bypasses mode selection/decryption entirely, e.g. a spy proving
  // context reaches decide(). Production callers never pass this.
  engine?: TailorEngine;
  config?: Partial<Config>;
};

// Selects the engine for one tailor request exactly like the stateless
// /api/tailor route does: fixture mode is keyless; the claude-cli provider is
// keyless too (it authenticates through the local CLI's own login); every other
// live provider decrypts the stored BYOK key per request (never a boot-time
// constant) or short-circuits to 'no_api_key' before any provider call.
function resolveEngine(
  db: Db,
  config: Config,
  deps?: ApplicationsRoutesDeps,
): TailorEngine | { error: "no_api_key" } {
  if (deps?.engine) return deps.engine;
  if (config.tailorEngine === "fixture") return new FixtureEngine();

  const settingsRow = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  // Ordered BEFORE the secrets read on purpose: the CLI engine has no use for a
  // BYOK key, so this path must never touch the secrets table at all — not read
  // it and find the column empty, and never decrypt.
  if (settingsRow.provider === "claude-cli") {
    return new ClaudeCliEngine({ model: settingsRow.model });
  }

  const secretsRow = db.select().from(secrets).where(eq(secrets.id, 1)).get();
  if (!secretsRow?.apiKeyEnc) return { error: "no_api_key" };

  // Decrypted in memory for this request only — never persisted, logged, or returned.
  const apiKey = decrypt(secretsRow.apiKeyEnc, config.masterKey);
  return new ProviderEngine({
    provider: settingsRow.provider as ProviderId,
    model: settingsRow.model,
    apiKey,
    baseURL: settingsRow.baseUrl ?? undefined,
  });
}

// The LIST payload omits the heavy current/locked TailoredResume snapshots
// (§9 "no heavy snapshots") — only metadata + genState + currentMeta. The
// letter snapshots (letterCurrent/letterPrevious) are the same kind of heavy
// document payload and are omitted here for the same reason (§ letter epic).
// `letterGenState` and `locked` (T030 CO-1, OQ4a card content) are additive:
// the dashboard card needs a letter-state pill and a locked badge, but never
// the heavy snapshots themselves — `locked` is derived to a plain boolean
// (existence, not content) rather than selecting the `locked` column.
const LIST_COLUMNS = {
  id: applications.id,
  company: applications.company,
  role: applications.role,
  jobDescription: applications.jobDescription,
  context: applications.context,
  targetPages: applications.targetPages,
  genState: applications.genState,
  letterGenState: applications.letterGenState,
  locked: sql<boolean>`(${applications.locked} is not null)`.mapWith(Boolean),
  currentMeta: applications.currentMeta,
  createdAt: applications.createdAt,
  updatedAt: applications.updatedAt,
} as const;

export function applicationsRoutes(
  app: FastifyInstance,
  db: Db,
  deps?: ApplicationsRoutesDeps,
): void {
  app.get("/api/applications", async () => {
    return db.select(LIST_COLUMNS).from(applications).all();
  });

  app.post("/api/applications", async (request, reply) => {
    const parsed = applicationCreateWithFormat.safeParse(request.body);
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
      targetPages: input.targetPages ?? 1,
      format: input.format ?? null,
      current: null,
      locked: null,
      lockedFormat: null,
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
    return migrateStoredApplicationFormats(row);
  });

  app.put<{ Params: { id: string } }>("/api/applications/:id", async (request, reply) => {
    const parsed = applicationUpdateWithFormat.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }

    const existingRow = db
      .select()
      .from(applications)
      .where(eq(applications.id, request.params.id))
      .get();
    if (!existingRow) {
      return reply.code(404).send({ error: "not_found" });
    }
    const existing = migrateStoredApplicationFormats(existingRow);

    const input = parsed.data;
    const row = {
      ...existing,
      ...(input.company !== undefined ? { company: input.company ?? null } : {}),
      ...(input.role !== undefined ? { role: input.role ?? null } : {}),
      ...(input.jobDescription !== undefined ? { jobDescription: input.jobDescription } : {}),
      ...(input.context !== undefined ? { context: input.context ?? null } : {}),
      ...(input.motivation !== undefined ? { motivation: input.motivation ?? null } : {}),
      ...(input.targetPages !== undefined ? { targetPages: input.targetPages } : {}),
      ...(input.format !== undefined ? { format: input.format ?? null } : {}),
      updatedAt: Date.now(),
    };
    db.update(applications).set(row).where(eq(applications.id, existing.id)).run();
    return reply.code(200).send(row);
  });

  app.delete<{ Params: { id: string } }>("/api/applications/:id", async (request, reply) => {
    db.delete(applications).where(eq(applications.id, request.params.id)).run();
    return reply.code(200).send({ ok: true });
  });

  // ── T031 CO-2 duplicate (Phase 3, OQ4b's dashboard "duplicate" action) —
  // deep-copies the FULL row (company/role/jd/context/motivation/
  // targetPages/format, the current+locked tailored snapshots and
  // lockedFormat, the letter's current+previous+genState, gen/letter state)
  // into a fresh id, structuredClone'd so the new row shares no nested
  // object with the source (editing the duplicate can never mutate the
  // original's snapshots). Only id/createdAt/updatedAt are fresh — an
  // editable clone, not a reference. ──
  app.post<{ Params: { id: string } }>(
    "/api/applications/:id/duplicate",
    async (request, reply) => {
      const existingRow = db
        .select()
        .from(applications)
        .where(eq(applications.id, request.params.id))
        .get();
      if (!existingRow) {
        return reply.code(404).send({ error: "not_found" });
      }
      const existing = migrateStoredApplicationFormats(existingRow);

      const now = Date.now();
      const row = {
        ...structuredClone(existing),
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      db.insert(applications).values(row).run();
      return reply.code(201).send({ id: row.id });
    },
  );

  // ── application-scoped tailor (§27) — purely additive alongside the
  // stateless /api/tailor; persists the result on the application record
  // instead of returning it bare ──
  app.post<{ Params: { id: string } }>("/api/applications/:id/tailor", async (request, reply) => {
    const existingRow = db
      .select()
      .from(applications)
      .where(eq(applications.id, request.params.id))
      .get();
    if (!existingRow) {
      return reply.code(404).send({ error: "not_found" });
    }
    const existing = migrateStoredApplicationFormats(existingRow);

    // ── cross-document in-flight guard (T14): ONE generation at a time per
    // application, across BOTH the resume and letter routes. A real
    // server-side check on persisted state — never client-only. ──
    if (existing.genState === "tailoring" || existing.letterGenState === "tailoring") {
      return reply.code(409).send({ error: "generation_in_flight" });
    }

    const config: Config = { ...loadConfig(), ...deps?.config };
    const engine = resolveEngine(db, config, deps);
    if ("error" in engine) {
      return reply.code(400).send({ error: engine.error });
    }

    // Flag lands BEFORE the await so a concurrent request's guard check
    // above observes it (better-sqlite3 is synchronous; this commits
    // immediately, prior to yielding the event loop at the engine await).
    db.update(applications)
      .set({ genState: "tailoring", updatedAt: Date.now() })
      .where(eq(applications.id, existing.id))
      .run();

    try {
      const jdEntries = db.select().from(entries).all().map(rowToEntry);
      const settingsRow = db.select().from(settings).where(eq(settings.id, 1)).get()!;
      const profileRow = db.select().from(profile).where(eq(profile.id, 1)).get();

      // §28.5 — derive a content budget from paper/targetPages/effective
      // format and ride it on the user message, same transport as context.
      // Both sides are already-migrated v2 here: existing.format went through
      // migrateStoredApplicationFormats above; settingsRow.defaultFormat still
      // needs its own resolveStoredFormat gate (a fresh DB's column DEFAULT is
      // frozen v1 JSON — see format-v2.ts's comment on resolveStoredFormat).
      const effectiveFormat = existing.format ?? resolveStoredFormat(settingsRow.defaultFormat);
      const budget = deriveContentBudget({
        paper: settingsRow.paper,
        targetPages: existing.targetPages,
        format: effectiveFormat,
      });

      const resume = await tailor(
        engine,
        existing.jobDescription,
        jdEntries,
        settingsRow.layout,
        profileRow?.baseSummary,
        existing.context,
        budget,
        voicePrompt(profileRow?.voiceSources ?? []),
      );

      const row = {
        ...existing,
        current: resume,
        genState: "tailored" as const,
        currentMeta: {
          at: Date.now(),
          provider: settingsRow.provider as ProviderId,
          model: settingsRow.model,
        },
        updatedAt: Date.now(),
      };
      db.update(applications).set(row).where(eq(applications.id, existing.id)).run();
      return reply.code(200).send(row);
    } catch (err) {
      db.update(applications)
        .set({ genState: "failed", updatedAt: Date.now() })
        .where(eq(applications.id, existing.id))
        .run();

      const { status, body } = mapTailorError(err);
      if (status >= 500) app.log.error(err);
      return reply.code(status).send(body);
    }
  });

  // ── application-scoped letter generation — independent of /tailor (§ letter
  // epic): re-tailor never regenerates the letter and vice versa; each draws
  // on the live Library + JD (+ motivation/context) at its own generate time.
  // Mirrors /tailor's shape but writes the letterCurrent/letterPrevious/
  // letterGenState/letterFailedReason columns only — `current` (the resume
  // snapshot) is never touched here. ──
  app.post<{ Params: { id: string } }>(
    "/api/applications/:id/generate-letter",
    async (request, reply) => {
      const existingRow = db
        .select()
        .from(applications)
        .where(eq(applications.id, request.params.id))
        .get();
      if (!existingRow) {
        return reply.code(404).send({ error: "not_found" });
      }
      const existing = migrateStoredApplicationFormats(existingRow);

      // ── cross-document in-flight guard (T14): mirrors /tailor's guard —
      // ONE generation at a time per application, across both documents. ──
      if (existing.genState === "tailoring" || existing.letterGenState === "tailoring") {
        return reply.code(409).send({ error: "generation_in_flight" });
      }

      const config: Config = { ...loadConfig(), ...deps?.config };
      const engine = resolveEngine(db, config, deps);
      if ("error" in engine) {
        return reply.code(400).send({ error: engine.error });
      }

      // Flag lands BEFORE the await — see /tailor's identical comment.
      db.update(applications)
        .set({ letterGenState: "tailoring", updatedAt: Date.now() })
        .where(eq(applications.id, existing.id))
        .run();

      try {
        const jdEntries = db.select().from(entries).all().map(rowToEntry);
        const profileRow = db.select().from(profile).where(eq(profile.id, 1)).get();

        const letter = await tailorLetter(
          engine,
          existing.jobDescription,
          jdEntries,
          existing.motivation,
          existing.context,
          voicePrompt(profileRow?.voiceSources ?? []),
        );

        const row = {
          ...existing,
          letterPrevious: existing.letterCurrent,
          letterCurrent: letter,
          letterGenState: "tailored" as const,
          letterFailedReason: null,
          updatedAt: Date.now(),
        };
        db.update(applications).set(row).where(eq(applications.id, existing.id)).run();
        return reply.code(200).send(row);
      } catch (err) {
        const { status, body } = mapTailorError(err);
        db.update(applications)
          .set({
            letterGenState: "failed",
            letterFailedReason: body.error,
            updatedAt: Date.now(),
          })
          .where(eq(applications.id, existing.id))
          .run();

        if (status >= 500) app.log.error(err);
        return reply.code(status).send(body);
      }
    },
  );

  // One-level undo, letter-only: swaps letterCurrent <-> letterPrevious, so
  // applying it twice returns to the starting state.
  app.post<{ Params: { id: string } }>(
    "/api/applications/:id/undo-letter",
    async (request, reply) => {
      const existingRow = db
        .select()
        .from(applications)
        .where(eq(applications.id, request.params.id))
        .get();
      if (!existingRow) {
        return reply.code(404).send({ error: "not_found" });
      }
      const existing = migrateStoredApplicationFormats(existingRow);

      const row = {
        ...existing,
        letterCurrent: existing.letterPrevious,
        letterPrevious: existing.letterCurrent,
        updatedAt: Date.now(),
      };
      db.update(applications).set(row).where(eq(applications.id, existing.id)).run();
      return reply.code(200).send(row);
    },
  );

  // ── per-part text edit (T31) — hand-authored, trusted-authorship changes to
  // ONE part of `current` (the summary, or one item's text), never the
  // letter (a separate ticket's job) and never structure: resumePartPatchZ is
  // .strict() so a structural field can't ride along. Edits mutate `current`
  // IN PLACE — they never displace snapshots — and are NOT fabrication-
  // validated (locked decision: hand-edits are trusted authorship). A locked
  // application 409s, mirroring /tailor and /generate-letter's in-flight 409s
  // as "this application's documents are not editable right now". ──
  app.patch<{ Params: { id: string } }>(
    "/api/applications/:id/resume-part",
    async (request, reply) => {
      const parsed = resumePartPatchZ.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
      }

      const existingRow = db
        .select()
        .from(applications)
        .where(eq(applications.id, request.params.id))
        .get();
      if (!existingRow) {
        return reply.code(404).send({ error: "not_found" });
      }
      const existing = migrateStoredApplicationFormats(existingRow);

      if (existing.locked !== null) {
        return reply.code(409).send({ error: "locked" });
      }
      if (existing.current === null) {
        return reply.code(400).send({ error: "invalid_path" });
      }

      const updatedCurrent = applyResumePartPatch(
        existing.current,
        parsed.data.path,
        parsed.data.text,
      );
      if (updatedCurrent === null) {
        return reply.code(400).send({ error: "invalid_path" });
      }

      const row = { ...existing, current: updatedCurrent, updatedAt: Date.now() };
      db.update(applications).set(row).where(eq(applications.id, existing.id)).run();
      return reply.code(200).send(row);
    },
  );

  // ── T32 letter-part text edit — richer than the resume's (LOCKED decision:
  // letter prose structure IS the user's), but this route itself is
  // text-level only, mirroring /resume-part exactly: letterPartPatchZ is
  // .strict() so a structural field (groundedOn included) can't ride along.
  // Editing a body paragraph preserves its groundedOn untouched. Mutates
  // `letterCurrent` IN PLACE — never touches `current`/letterPrevious/
  // letterGenState — and is NOT fabrication-validated (hand-edits are
  // trusted authorship). A locked application 409s, same as /resume-part. ──
  app.patch<{ Params: { id: string } }>(
    "/api/applications/:id/letter-part",
    async (request, reply) => {
      const parsed = letterPartPatchZ.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
      }

      const existingRow = db
        .select()
        .from(applications)
        .where(eq(applications.id, request.params.id))
        .get();
      if (!existingRow) {
        return reply.code(404).send({ error: "not_found" });
      }
      const existing = migrateStoredApplicationFormats(existingRow);

      if (existing.locked !== null) {
        return reply.code(409).send({ error: "locked" });
      }
      if (existing.letterCurrent === null) {
        return reply.code(400).send({ error: "invalid_path" });
      }

      const updatedLetter = applyLetterPartPatch(
        existing.letterCurrent,
        parsed.data.path,
        parsed.data.text,
      );
      if (updatedLetter === null) {
        return reply.code(400).send({ error: "invalid_path" });
      }

      const row = { ...existing, letterCurrent: updatedLetter, updatedAt: Date.now() };
      db.update(applications).set(row).where(eq(applications.id, existing.id)).run();
      return reply.code(200).send(row);
    },
  );

  // ── T32 letter paragraph insert — the letter's one structural allowance:
  // a hand-added paragraph ALWAYS carries groundedOn:[] (see
  // insertLetterParagraph's comment) — server-forced, not client-trusted.
  // Position out of range / locked / no letterCurrent -> 400/409, mirroring
  // /letter-part. ──
  app.post<{ Params: { id: string } }>(
    "/api/applications/:id/letter-part/paragraph",
    async (request, reply) => {
      const parsed = letterParagraphInsertZ.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
      }

      const existingRow = db
        .select()
        .from(applications)
        .where(eq(applications.id, request.params.id))
        .get();
      if (!existingRow) {
        return reply.code(404).send({ error: "not_found" });
      }
      const existing = migrateStoredApplicationFormats(existingRow);

      if (existing.locked !== null) {
        return reply.code(409).send({ error: "locked" });
      }
      if (existing.letterCurrent === null) {
        return reply.code(400).send({ error: "invalid_path" });
      }

      const updatedLetter = insertLetterParagraph(
        existing.letterCurrent,
        parsed.data.position,
        parsed.data.text,
      );
      if (updatedLetter === null) {
        return reply.code(400).send({ error: "invalid_path" });
      }

      const row = { ...existing, letterCurrent: updatedLetter, updatedAt: Date.now() };
      db.update(applications).set(row).where(eq(applications.id, existing.id)).run();
      return reply.code(200).send(row);
    },
  );

  // ── T32 letter paragraph remove — index out of range / locked / no
  // letterCurrent -> 400/409, mirroring /letter-part. Index rides the URL
  // (a route param, coerced by letterParagraphRemoveZ) rather than a DELETE
  // body, matching this route's REST shape (index addresses a resource, it
  // isn't a field being written). ──
  app.delete<{ Params: { id: string; index: string } }>(
    "/api/applications/:id/letter-part/paragraph/:index",
    async (request, reply) => {
      const parsed = letterParagraphRemoveZ.safeParse({ index: request.params.index });
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
      }

      const existingRow = db
        .select()
        .from(applications)
        .where(eq(applications.id, request.params.id))
        .get();
      if (!existingRow) {
        return reply.code(404).send({ error: "not_found" });
      }
      const existing = migrateStoredApplicationFormats(existingRow);

      if (existing.locked !== null) {
        return reply.code(409).send({ error: "locked" });
      }
      if (existing.letterCurrent === null) {
        return reply.code(400).send({ error: "invalid_path" });
      }

      const updatedLetter = removeLetterParagraph(existing.letterCurrent, parsed.data.index);
      if (updatedLetter === null) {
        return reply.code(400).send({ error: "invalid_path" });
      }

      const row = { ...existing, letterCurrent: updatedLetter, updatedAt: Date.now() };
      db.update(applications).set(row).where(eq(applications.id, existing.id)).run();
      return reply.code(200).send(row);
    },
  );

  // ── T32 blank letter creation — the retroactive-import entry point: a
  // letter draft may be created blank, with NO model call / engine
  // resolution at all (locked decision). letterGenState stays "untailored"
  // (the non-generated value) — this is not a generation, so it never enters
  // the tailoring/tailored/failed taxonomy that /generate-letter drives.
  // letterPrevious is left untouched: this route only ever writes
  // letterCurrent, mirroring how /resume-part touches only `current`. ──
  app.post<{ Params: { id: string } }>(
    "/api/applications/:id/letter-blank",
    async (request, reply) => {
      const existingRow = db
        .select()
        .from(applications)
        .where(eq(applications.id, request.params.id))
        .get();
      if (!existingRow) {
        return reply.code(404).send({ error: "not_found" });
      }
      const existing = migrateStoredApplicationFormats(existingRow);

      if (existing.locked !== null) {
        return reply.code(409).send({ error: "locked" });
      }

      const blankLetter: CoverLetter = { greeting: "", body: [], closing: "" };
      const row = { ...existing, letterCurrent: blankLetter, updatedAt: Date.now() };
      db.update(applications).set(row).where(eq(applications.id, existing.id)).run();
      return reply.code(200).send(row);
    },
  );

  // ── T42 flag-voice — the ONLY door into profile.voiceSources. Flagging
  // COPIES a FROZEN prose snapshot; it never points at the mutable
  // `current`/`letterCurrent` (a plain string, computed once here, achieves
  // that — nothing downstream can make it track later edits). LOCKED-
  // PERMITTED: no `existing.locked` gate — locking blocks generation/editing,
  // never flagging. Cap enforcement happens BEFORE append: at exactly 5
  // sources a 6th flag 409s and the computed text is discarded, never
  // stored — no ring-buffer eviction. ──
  app.post<{ Params: { id: string } }>(
    "/api/applications/:id/flag-voice",
    async (request, reply) => {
      const parsed = flagVoiceBodyZ.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
      }

      const existingRow = db
        .select()
        .from(applications)
        .where(eq(applications.id, request.params.id))
        .get();
      if (!existingRow) {
        return reply.code(404).send({ error: "not_found" });
      }
      const existing = migrateStoredApplicationFormats(existingRow);
      const profileRow = db.select().from(profile).where(eq(profile.id, 1)).get()!;

      let text: string;
      if (parsed.data.kind === "resume") {
        if (existing.current === null) {
          return reply.code(400).send({ error: "no_source" });
        }
        text = plainText(existing.current, rowToProfile(profileRow));
      } else {
        if (existing.letterCurrent === null) {
          return reply.code(400).send({ error: "no_source" });
        }
        text = letterProse(existing.letterCurrent);
      }

      if (profileRow.voiceSources.length >= VOICE_SOURCES_CAP) {
        return reply.code(409).send({ error: "voice_cap" });
      }

      const source = { id: randomUUID(), kind: parsed.data.kind, text, at: Date.now() };
      const voiceSources = [...profileRow.voiceSources, source];
      db.update(profile)
        .set({ voiceSources, updatedAt: Date.now() })
        .where(eq(profile.id, 1))
        .run();

      return reply.code(200).send(source);
    },
  );

  // ── lock/unlock (§27 integrity invariant) — `locked` is a deep copy of
  // `current`'s content at lock time, never a reference to it or to the
  // Library entries it was built from, so editing/deleting an entry (or a
  // later re-tailor) can never retroactively change a locked snapshot.
  // `lockedFormat` freezes the same way: the fit ladder is a later epic, so
  // resolvedDensity is 'as-set' = 'comfortable' until then (§28.3) ──
  app.post<{ Params: { id: string } }>("/api/applications/:id/lock", async (request, reply) => {
    const existingRow = db
      .select()
      .from(applications)
      .where(eq(applications.id, request.params.id))
      .get();
    if (!existingRow) {
      return reply.code(404).send({ error: "not_found" });
    }
    const existing = migrateStoredApplicationFormats(existingRow);
    if (existing.current === null) {
      return reply.code(400).send({ error: "no_current" });
    }

    const settingsRow = db.select().from(settings).where(eq(settings.id, 1)).get()!;
    const lockedFormat = structuredClone({
      format: existing.format ?? resolveStoredFormat(settingsRow.defaultFormat),
      resolvedDensity: "comfortable" as const,
      paper: settingsRow.paper,
    });

    const row = {
      ...existing,
      locked: structuredClone(existing.current),
      lockedFormat,
      updatedAt: Date.now(),
    };
    db.update(applications).set(row).where(eq(applications.id, existing.id)).run();
    return reply.code(200).send(row);
  });

  app.delete<{ Params: { id: string } }>("/api/applications/:id/lock", async (request, reply) => {
    const existingRow = db
      .select()
      .from(applications)
      .where(eq(applications.id, request.params.id))
      .get();
    if (!existingRow) {
      return reply.code(404).send({ error: "not_found" });
    }
    const existing = migrateStoredApplicationFormats(existingRow);

    const row = { ...existing, locked: null, lockedFormat: null, updatedAt: Date.now() };
    db.update(applications).set(row).where(eq(applications.id, existing.id)).run();
    return reply.code(200).send(row);
  });
}
