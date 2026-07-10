// T33 — overwrite + one-level undo semantics, end-to-end, both documents.
// LOCKED contract under test: re-tailor/regenerate overwrites the draft
// WHOLESALE (edits included, no merge, no edit history); edit -> undo ->
// the edited draft sits in `previous`, one re-undo restores it; a
// subsequent generation overwrites `previous` too, so the edit is gone for
// good — one-level undo is the ONLY preservation, never a stack.
//
// FixtureEngine.decide/decideLetter key on (jd, entries) ONLY (see
// engine.ts) — re-tailoring/regenerating with the SAME jd+entries always
// replays the SAME decision, so "the fixture text is back" is a real,
// deterministic assertion, not a coincidence. CONTRAST_JDS[0]/[1] give two
// JDs that record to two DISTINCT fixtures (mirrors
// api.applications-letter.test.ts's convention for driving distinct
// letters via a JD swap, since motivation/context never affect replay
// matching).
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";

import type { CoverLetter, TailoredResume } from "@shared/types";
import { buildApp } from "../src/server/index";
import { initDb, type Db } from "../src/server/db";
import { seedIfEmpty } from "../src/server/seed";
import { CONTRAST_JDS } from "../src/server/tailor/evalcore";

const tmpDirs: string[] = [];

function freshDb(): Db {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-applications-overwrite-"));
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

async function put(app: FastifyInstance, url: string, payload: unknown) {
  return app.inject({ method: "PUT", url, payload });
}

// Finds the first real (section, group, index) triple carrying an item —
// addresses whatever FixtureEngine happens to produce rather than a
// hardcoded fixture-specific shape (mirrors api.applications-edit.test.ts).
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

describe("overwrite semantics — /tailor overwrites `current` WHOLESALE, edits included", () => {
  it("hand-edited item text is present pre-overwrite, then GONE (fixture text back) after re-tailor", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const jd = CONTRAST_JDS[0]!.jd;
    const created = await post(app, "/api/applications", { jobDescription: jd });
    const id = created.json().id as string;

    const tailored = await post(app, `/api/applications/${id}/tailor`);
    expect(tailored.statusCode).toBe(200);
    const original = tailored.json().current as TailoredResume;
    const target = firstItemPath(original);
    const originalText = original.sections.find((s) => s.section === target.section)!.groups[
      target.group
    ]!.items[target.index]!.text;

    const edited = await patch(app, `/api/applications/${id}/resume-part`, {
      path: { kind: "item", ...target },
      text: "hand-edited text, definitely not the fixture",
    });
    expect(edited.statusCode).toBe(200);

    // Pre-overwrite: the edit is PRESENT — a no-op re-tailor-and-check would
    // otherwise pass this test vacuously.
    const preOverwriteText = edited
      .json()
      .current.sections.find((s: { section: string }) => s.section === target.section).groups[
      target.group
    ].items[target.index].text;
    expect(preOverwriteText).toBe("hand-edited text, definitely not the fixture");

    // Re-tailor with the SAME jd+entries -> FixtureEngine replays the SAME
    // decision -> the edit is overwritten wholesale, fixture text is back.
    const retailored = await post(app, `/api/applications/${id}/tailor`);
    expect(retailored.statusCode).toBe(200);
    const after = retailored.json().current as TailoredResume;
    const afterText = after.sections.find((s) => s.section === target.section)!.groups[
      target.group
    ]!.items[target.index]!.text;

    expect(afterText).not.toBe("hand-edited text, definitely not the fixture");
    expect(afterText).toBe(originalText);
    expect(after).toEqual(original);
  });
});

describe("overwrite semantics — /generate-letter overwrites `letterCurrent` WHOLESALE, edits included", () => {
  it("hand-edited paragraph text is present pre-overwrite, then GONE (fixture text back) after regenerate", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const jd = CONTRAST_JDS[0]!.jd;
    const created = await post(app, "/api/applications", { jobDescription: jd });
    const id = created.json().id as string;

    const lettered = await post(app, `/api/applications/${id}/generate-letter`);
    expect(lettered.statusCode).toBe(200);
    const original = lettered.json().letterCurrent as CoverLetter;
    expect(original.body.length).toBeGreaterThan(0);
    const originalText = original.body[0]!.text;

    const edited = await patch(app, `/api/applications/${id}/letter-part`, {
      path: { kind: "body", index: 0 },
      text: "hand-edited paragraph, definitely not the fixture",
    });
    expect(edited.statusCode).toBe(200);

    // Pre-overwrite: the edit is PRESENT.
    expect(edited.json().letterCurrent.body[0].text).toBe(
      "hand-edited paragraph, definitely not the fixture",
    );

    // Regenerate with the SAME jd+entries -> same replayed decision -> the
    // edit is overwritten wholesale, fixture text is back.
    const regenerated = await post(app, `/api/applications/${id}/generate-letter`);
    expect(regenerated.statusCode).toBe(200);
    const after = regenerated.json().letterCurrent as CoverLetter;

    expect(after.body[0]!.text).not.toBe("hand-edited paragraph, definitely not the fixture");
    expect(after.body[0]!.text).toBe(originalText);
    expect(after).toEqual(original);
  });
});

describe("one-level undo — edit sits in `previous` after one undo, restores on a re-undo", () => {
  it("generate-letter TWICE (distinct fixtures) -> edit current -> undo swaps current/previous exactly -> undo again restores the edit", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const jdA = CONTRAST_JDS[0]!.jd;
    const jdB = CONTRAST_JDS[1]!.jd;

    const created = await post(app, "/api/applications", { jobDescription: jdA });
    const id = created.json().id as string;

    // First generation, under jdA.
    const first = await post(app, `/api/applications/${id}/generate-letter`);
    expect(first.statusCode).toBe(200);
    const letter1 = first.json().letterCurrent as CoverLetter;
    expect(first.json().letterPrevious).toBeNull();

    // Swap the JD, then generate again -> a DISTINCT fixture, letter1 moves
    // into letterPrevious.
    const putRes = await put(app, `/api/applications/${id}`, { jobDescription: jdB });
    expect(putRes.statusCode).toBe(200);

    const second = await post(app, `/api/applications/${id}/generate-letter`);
    expect(second.statusCode).toBe(200);
    const letter2 = second.json().letterCurrent as CoverLetter;
    expect(letter2).not.toEqual(letter1);
    expect(second.json().letterPrevious).toEqual(letter1);

    // Edit the CURRENT draft (letter2). letterPrevious (letter1) must be
    // untouched by the edit.
    const edited = await patch(app, `/api/applications/${id}/letter-part`, {
      path: { kind: "greeting" },
      text: "Dear hand-edited greeting,",
    });
    expect(edited.statusCode).toBe(200);
    const editedLetter2 = edited.json().letterCurrent as CoverLetter;
    expect(editedLetter2.greeting).toBe("Dear hand-edited greeting,");
    expect(editedLetter2).not.toEqual(letter2);
    expect(edited.json().letterPrevious).toEqual(letter1);

    // Undo once: current <-> previous swap — current becomes the
    // old-previous (letter1, byte-exact); previous becomes the edited
    // draft (byte-exact) — asserted in BOTH directions.
    const undone = await post(app, `/api/applications/${id}/undo-letter`);
    expect(undone.statusCode).toBe(200);
    expect(undone.json().letterCurrent).toEqual(letter1);
    expect(undone.json().letterPrevious).toEqual(editedLetter2);

    // Undo again (the re-undo): the edited draft is restored to current.
    const redone = await post(app, `/api/applications/${id}/undo-letter`);
    expect(redone.statusCode).toBe(200);
    expect(redone.json().letterCurrent).toEqual(editedLetter2);
    expect(redone.json().letterPrevious).toEqual(letter1);
  });
});

describe("unrecoverable — a fresh generation overwrites `previous` too, the edit is gone for good", () => {
  it("edit -> undo (edit now in previous) -> fresh generate-letter -> undo once more -> edit is in NEITHER field", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const jdA = CONTRAST_JDS[0]!.jd;
    const jdB = CONTRAST_JDS[1]!.jd;

    const created = await post(app, "/api/applications", { jobDescription: jdA });
    const id = created.json().id as string;

    const first = await post(app, `/api/applications/${id}/generate-letter`);
    const letter1 = first.json().letterCurrent as CoverLetter;

    await put(app, `/api/applications/${id}`, { jobDescription: jdB });
    const second = await post(app, `/api/applications/${id}/generate-letter`);
    const letter2 = second.json().letterCurrent as CoverLetter;
    expect(letter2).not.toEqual(letter1);

    const edited = await patch(app, `/api/applications/${id}/letter-part`, {
      path: { kind: "closing" },
      text: "An unrecoverable closing,",
    });
    expect(edited.statusCode).toBe(200);
    const editedLetter2 = edited.json().letterCurrent as CoverLetter;
    expect(editedLetter2.closing).toBe("An unrecoverable closing,");

    // Single undo: the edited draft now sits in letterPrevious. Confirmed
    // present there before we go on to destroy it.
    const undone = await post(app, `/api/applications/${id}/undo-letter`);
    expect(undone.statusCode).toBe(200);
    expect(undone.json().letterCurrent).toEqual(letter1);
    expect(undone.json().letterPrevious).toEqual(editedLetter2);

    // A fresh generate-letter (same jd/entries as `second` -> replays
    // letter2 deterministically) overwrites BOTH fields: letterCurrent
    // becomes the fresh decision, and letterPrevious becomes whatever
    // letterCurrent held just before this call (letter1) — clobbering the
    // edited draft that was sitting there. One-level undo means "previous"
    // is a single slot, never a stack: it holds no memory of what used to
    // be there.
    const fresh = await post(app, `/api/applications/${id}/generate-letter`);
    expect(fresh.statusCode).toBe(200);
    expect(fresh.json().letterCurrent).toEqual(letter2);
    expect(fresh.json().letterPrevious).toEqual(letter1);
    expect(fresh.json().letterPrevious).not.toEqual(editedLetter2);

    // Even a fresh undo can't surface it: the edited draft is in NEITHER
    // letterCurrent NOR letterPrevious — recovery genuinely fails, not
    // merely "a field's value moved".
    const undoAfterFresh = await post(app, `/api/applications/${id}/undo-letter`);
    expect(undoAfterFresh.statusCode).toBe(200);
    expect(undoAfterFresh.json().letterCurrent).not.toEqual(editedLetter2);
    expect(undoAfterFresh.json().letterPrevious).not.toEqual(editedLetter2);
    expect(undoAfterFresh.json().letterCurrent.closing).not.toBe("An unrecoverable closing,");
    expect(undoAfterFresh.json().letterPrevious.closing).not.toBe("An unrecoverable closing,");
  });
});
