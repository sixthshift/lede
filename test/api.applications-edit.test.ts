// T31 — PATCH /api/applications/:id/resume-part. Text-level edits on the
// resume are UNREPRESENTABLE-BY-CONSTRUCTION as structural changes:
// resumePartPatchZ's `.strict()` means a structural field riding along a
// well-formed patch is rejected outright (400), never silently stripped and
// accepted. Structure (which items, order, grouping) stays the model's;
// editing is text-level only (locked decision). A locked application 409s.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";

import type { TailoredResume } from "@shared/types";
import { resumePartPatchZ } from "@shared/schema";
import { buildApp } from "../src/server/index";
import { initDb, type Db } from "../src/server/db";
import { seedIfEmpty } from "../src/server/seed";
import { CONTRAST_JDS } from "../src/server/tailor/evalcore";

const tmpDirs: string[] = [];

function freshDb(): Db {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-applications-edit-"));
  tmpDirs.push(dir);
  return initDb(dir).db;
}

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

async function post(app: FastifyInstance, url: string, payload: unknown = {}) {
  return app.inject({ method: "POST", url, payload });
}

async function patch(app: FastifyInstance, url: string, payload: unknown) {
  return app.inject({ method: "PATCH", url, payload });
}

async function get(app: FastifyInstance, url: string) {
  return app.inject({ method: "GET", url });
}

// Finds the first real (section, group, index) triple carrying an item, so
// tests address a real part of whatever FixtureEngine happens to produce
// rather than hardcoding a fixture-specific shape.
function firstItemPath(resume: TailoredResume): { section: string; group: number; index: number } {
  for (const section of resume.sections) {
    for (let group = 0; group < section.groups.length; group++) {
      if (section.groups[group]!.items.length > 0) {
        return { section: section.section, group, index: 0 };
      }
    }
  }
  throw new Error("fixture produced a resume with no items — cannot address a part");
}

async function createTailored(
  app: FastifyInstance,
): Promise<{ id: string; current: TailoredResume }> {
  const created = await post(app, "/api/applications", { jobDescription: CONTRAST_JDS[0]!.jd });
  const id = created.json().id as string;
  const tailored = await post(app, `/api/applications/${id}/tailor`);
  expect(tailored.statusCode).toBe(200);
  return { id, current: tailored.json().current as TailoredResume };
}

describe("resumePartPatchZ — strict by construction", () => {
  it("accepts a well-formed item patch", () => {
    const result = resumePartPatchZ.safeParse({
      path: { kind: "item", section: "experience", group: 0, index: 0 },
      text: "new text",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a well-formed summary patch", () => {
    const result = resumePartPatchZ.safeParse({ path: { kind: "summary" }, text: "new summary" });
    expect(result.success).toBe(true);
  });

  // Structural fields are ABSENT from the schema, not merely stripped: an
  // otherwise-valid body carrying any of them fails to parse at all.
  it.each([
    "entryId",
    "rank",
    "groundedOn",
    "level",
    "structure",
  ])("rejects a well-formed patch carrying a stray top-level %s key", (key) => {
    const body = {
      path: { kind: "item", section: "experience", group: 0, index: 0 },
      text: "new text",
      [key]: "x",
    };
    expect(resumePartPatchZ.safeParse(body).success).toBe(false);
  });

  it("rejects a stray structural key on the path object itself", () => {
    const body = {
      path: { kind: "item", section: "experience", group: 0, index: 0, entryId: "x" },
      text: "new text",
    };
    expect(resumePartPatchZ.safeParse(body).success).toBe(false);
  });

  it("rejects a non-string text value", () => {
    const body = { path: { kind: "summary" }, text: 123 };
    expect(resumePartPatchZ.safeParse(body).success).toBe(false);
  });

  it("rejects an unknown path kind", () => {
    const body = { path: { kind: "bogus" }, text: "x" };
    expect(resumePartPatchZ.safeParse(body).success).toBe(false);
  });
});

describe("PATCH /api/applications/:id/resume-part — via FixtureEngine (keyless, recorded JD)", () => {
  it("200s and changes ONLY the addressed item's text — a full row diff shows nothing else moved", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const { id, current } = await createTailored(app);
    const target = firstItemPath(current);

    const res = await patch(app, `/api/applications/${id}/resume-part`, {
      path: { kind: "item", ...target },
      text: "hand-edited text",
    });
    expect(res.statusCode).toBe(200);
    const after = res.json();

    // Reconstruct what the row SHOULD look like if only that one item's text
    // changed — an input->output contrast, not a hand-picked assertion list.
    const expectedCurrent: TailoredResume = structuredClone(current);
    expectedCurrent.sections[
      expectedCurrent.sections.findIndex((s) => s.section === target.section)
    ]!.groups[target.group]!.items[target.index]!.text = "hand-edited text";

    expect(after.current).toEqual(expectedCurrent);

    // Everything else on the row is untouched.
    expect(after.genState).toBe("tailored");
    expect(after.locked).toBeNull();
    expect(after.currentMeta).toMatchObject({
      provider: expect.any(String),
      model: expect.any(String),
    });

    // Item counts/order/entryId identical, section by section.
    for (let si = 0; si < current.sections.length; si++) {
      expect(after.current.sections[si].groups.length).toBe(current.sections[si].groups.length);
      for (let gi = 0; gi < current.sections[si].groups.length; gi++) {
        const beforeItems = current.sections[si].groups[gi].items;
        const afterItems = after.current.sections[si].groups[gi].items;
        expect(afterItems.length).toBe(beforeItems.length);
        expect(afterItems.map((i: { entryId: string }) => i.entryId)).toEqual(
          beforeItems.map((i: { entryId: string }) => i.entryId),
        );
      }
    }
  });

  it("200s and changes ONLY the summary", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const { id, current } = await createTailored(app);

    const res = await patch(app, `/api/applications/${id}/resume-part`, {
      path: { kind: "summary" },
      text: "A hand-written summary.",
    });
    expect(res.statusCode).toBe(200);
    const after = res.json();

    const expectedCurrent: TailoredResume = { ...current, summary: "A hand-written summary." };
    expect(after.current).toEqual(expectedCurrent);
  });

  it("a well-formed structural attempt (valid text PLUS a structural key) -> 400, never silently stripped and 200", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const { id, current } = await createTailored(app);
    const target = firstItemPath(current);

    const res = await patch(app, `/api/applications/${id}/resume-part`, {
      path: { kind: "item", ...target },
      text: "valid text",
      entryId: "some-other-entry",
    });
    expect(res.statusCode).toBe(400);

    const fetched = await get(app, `/api/applications/${id}`);
    expect(fetched.json().current).toEqual(current);
  });

  it("index one past a real group's end -> 400, item count unchanged", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const { id, current } = await createTailored(app);
    const target = firstItemPath(current);
    const groupItems = current.sections.find((s) => s.section === target.section)!.groups[
      target.group
    ]!.items;

    const res = await patch(app, `/api/applications/${id}/resume-part`, {
      path: {
        kind: "item",
        section: target.section,
        group: target.group,
        index: groupItems.length,
      },
      text: "should not append",
    });
    expect(res.statusCode).toBe(400);

    const fetched = await get(app, `/api/applications/${id}`);
    const fetchedItems = fetched
      .json()
      .current.sections.find((s: { section: string }) => s.section === target.section).groups[
      target.group
    ].items;
    expect(fetchedItems.length).toBe(groupItems.length);
    expect(fetched.json().current).toEqual(current);
  });

  it("an unknown/typo'd part (section absent from the resume) -> 400", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const { id, current } = await createTailored(app);
    const present = new Set(current.sections.map((s) => s.section));
    const allSections = [
      "experience",
      "project",
      "education",
      "award",
      "certification",
      "publication",
      "reference",
      "skill",
      "interest",
      "language",
    ] as const;
    const absentSection = allSections.find((s) => !present.has(s));
    expect(absentSection).toBeDefined();

    const res = await patch(app, `/api/applications/${id}/resume-part`, {
      path: { kind: "item", section: absentSection, group: 0, index: 0 },
      text: "x",
    });
    expect(res.statusCode).toBe(400);
  });

  it("non-string text (e.g. 123) -> 400", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const { id, current } = await createTailored(app);
    const target = firstItemPath(current);

    const res = await patch(app, `/api/applications/${id}/resume-part`, {
      path: { kind: "item", ...target },
      text: 123,
    });
    expect(res.statusCode).toBe(400);
  });

  it("404s for a nonexistent application id", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const res = await patch(app, "/api/applications/does-not-exist/resume-part", {
      path: { kind: "summary" },
      text: "x",
    });
    expect(res.statusCode).toBe(404);
  });

  it("PATCH on a LOCKED application (locked via the real POST /lock) -> 409; GET shows the row byte-unchanged after", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const { id, current } = await createTailored(app);
    const lockRes = await post(app, `/api/applications/${id}/lock`);
    expect(lockRes.statusCode).toBe(200);

    const before = await get(app, `/api/applications/${id}`);
    const target = firstItemPath(current);

    const res = await patch(app, `/api/applications/${id}/resume-part`, {
      path: { kind: "item", ...target },
      text: "should never land",
    });
    expect(res.statusCode).toBe(409);

    const after = await get(app, `/api/applications/${id}`);
    expect(after.json()).toEqual(before.json());
  });
});
