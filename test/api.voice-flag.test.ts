// T42 — POST /api/applications/:id/flag-voice + DELETE
// /api/profile/voice-sources/:vid. The flag route is the ONLY door into
// profile.voiceSources: it COPIES a FROZEN prose snapshot (never a live
// reference to `current`/`letterCurrent`), is PERMITTED on a locked
// application, and is capped at VOICE_SOURCES_CAP (5) with no ring-buffer
// eviction. Mirrors api.applications-letter.test.ts's FixtureEngine harness.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";

import { plainText } from "@shared/plainText";
import type { CoverLetter, Profile, TailoredResume } from "@shared/types";
import { VOICE_SOURCES_CAP } from "@shared/schema";
import { buildApp } from "../src/server/index";
import { initDb, type Db } from "../src/server/db";
import { seedIfEmpty } from "../src/server/seed";
import { CONTRAST_JDS } from "../src/server/tailor/evalcore";

const tmpDirs: string[] = [];

function freshDb(): Db {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-voice-flag-"));
  tmpDirs.push(dir);
  return initDb(dir).db;
}

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

async function post(app: FastifyInstance, url: string, payload: unknown = {}) {
  return app.inject({ method: "POST", url, payload });
}

async function get(app: FastifyInstance, url: string) {
  return app.inject({ method: "GET", url });
}

async function createTailoredApp(app: FastifyInstance, jd: string) {
  const created = await post(app, "/api/applications", { jobDescription: jd });
  expect(created.statusCode).toBe(200);
  const id = created.json().id as string;
  const tailored = await post(app, `/api/applications/${id}/tailor`);
  expect(tailored.statusCode).toBe(200);
  return { id, current: tailored.json().current as TailoredResume };
}

const PROFILE_PAYLOAD = {
  name: "Jane Doe",
  headline: "Principal Engineer",
  email: "jane@example.com",
  phone: "555-1234",
  location: "Remote",
  links: [{ type: "github", label: "GitHub", url: "https://github.com/jane" }],
  baseSummary: "Ships platform SDKs.",
};

async function seedProfile(app: FastifyInstance): Promise<Profile> {
  const res = await app.inject({ method: "PUT", url: "/api/profile", payload: PROFILE_PAYLOAD });
  expect(res.statusCode).toBe(200);
  return res.json();
}

describe("POST /api/applications/:id/flag-voice — kind:'cover-letter'", () => {
  it("freezes the letter's prose; later edits never change the stored source (frozen, proven AFTER mutation)", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);
    await seedProfile(app);

    const jdA = CONTRAST_JDS[0]!.jd;
    const created = await post(app, "/api/applications", { jobDescription: jdA });
    const id = created.json().id as string;

    const lettered = await post(app, `/api/applications/${id}/generate-letter`);
    expect(lettered.statusCode).toBe(200);
    const letter = lettered.json().letterCurrent as CoverLetter;
    const expectedProse = [letter.greeting, ...letter.body.map((p) => p.text), letter.closing].join(
      "\n\n",
    );

    const flagged = await post(app, `/api/applications/${id}/flag-voice`, { kind: "cover-letter" });
    expect(flagged.statusCode).toBe(200);

    const afterFlag = await get(app, "/api/profile");
    const sources = afterFlag.json().voiceSources as Profile["voiceSources"];
    expect(sources).toHaveLength(1);
    expect(sources[0]!.kind).toBe("cover-letter");
    expect(sources[0]!.text).toBe(expectedProse);
    const storedId = sources[0]!.id;

    // Mutate the letter AFTER flagging — via a hand-edit of the greeting.
    const editRes = await app.inject({
      method: "PATCH",
      url: `/api/applications/${id}/letter-part`,
      payload: { path: { kind: "greeting" }, text: "Completely different greeting" },
    });
    expect(editRes.statusCode).toBe(200);
    expect(editRes.json().letterCurrent.greeting).toBe("Completely different greeting");

    // Regenerate too, for good measure — a distinct JD forces a distinct letter.
    const jdB = CONTRAST_JDS[1]!.jd;
    await app.inject({
      method: "PUT",
      url: `/api/applications/${id}`,
      payload: { jobDescription: jdB },
    });
    const regenerated = await post(app, `/api/applications/${id}/generate-letter`);
    expect(regenerated.statusCode).toBe(200);
    expect(regenerated.json().letterCurrent).not.toEqual(letter);

    const afterMutation = await get(app, "/api/profile");
    const sourcesAfter = afterMutation.json().voiceSources as Profile["voiceSources"];
    expect(sourcesAfter).toHaveLength(1);
    expect(sourcesAfter[0]!.id).toBe(storedId);
    expect(sourcesAfter[0]!.text).toBe(expectedProse); // unchanged — a true snapshot
  });
});

describe("POST /api/applications/:id/flag-voice — kind:'resume'", () => {
  it("freezes plainText(current, profile) exactly; a later re-tailor never touches the stored source", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);
    const profile = await seedProfile(app);

    const jdA = CONTRAST_JDS[0]!.jd;
    const { id, current } = await createTailoredApp(app, jdA);
    const expectedText = plainText(current, profile);

    const flagged = await post(app, `/api/applications/${id}/flag-voice`, { kind: "resume" });
    expect(flagged.statusCode).toBe(200);

    const afterFlag = await get(app, "/api/profile");
    const sources = afterFlag.json().voiceSources as Profile["voiceSources"];
    expect(sources).toHaveLength(1);
    expect(sources[0]!.kind).toBe("resume");
    expect(sources[0]!.text).toBe(expectedText); // deep string equality, not .includes
    const storedId = sources[0]!.id;

    // Re-tailor against a DISTINCT JD — overwrites `current` with a new resume.
    const jdB = CONTRAST_JDS[1]!.jd;
    await app.inject({
      method: "PUT",
      url: `/api/applications/${id}`,
      payload: { jobDescription: jdB },
    });
    const retailored = await post(app, `/api/applications/${id}/tailor`);
    expect(retailored.statusCode).toBe(200);
    const newCurrent = retailored.json().current as TailoredResume;
    expect(newCurrent).not.toEqual(current);

    const afterRetailor = await get(app, "/api/profile");
    const sourcesAfter = afterRetailor.json().voiceSources as Profile["voiceSources"];
    expect(sourcesAfter).toHaveLength(1);
    expect(sourcesAfter[0]!.id).toBe(storedId);
    expect(sourcesAfter[0]!.text).toBe(expectedText); // still the OLD plainText
    expect(sourcesAfter[0]!.text).not.toBe(plainText(newCurrent, profile));
  });
});

describe("flag-voice — validation and missing-source 400s", () => {
  it("an unknown kind -> 400", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);
    const created = await post(app, "/api/applications", { jobDescription: CONTRAST_JDS[0]!.jd });
    const id = created.json().id as string;

    const res = await post(app, `/api/applications/${id}/flag-voice`, { kind: "other" });
    expect(res.statusCode).toBe(400);
  });

  it("flagging a resume with no `current` -> 400", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);
    await seedProfile(app);
    const created = await post(app, "/api/applications", { jobDescription: CONTRAST_JDS[0]!.jd });
    const id = created.json().id as string;

    const res = await post(app, `/api/applications/${id}/flag-voice`, { kind: "resume" });
    expect(res.statusCode).toBe(400);
  });

  it("flagging a cover-letter with no `letterCurrent` -> 400", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);
    await seedProfile(app);
    const created = await post(app, "/api/applications", { jobDescription: CONTRAST_JDS[0]!.jd });
    const id = created.json().id as string;

    const res = await post(app, `/api/applications/${id}/flag-voice`, { kind: "cover-letter" });
    expect(res.statusCode).toBe(400);
  });

  it("a missing application -> 404", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);
    const res = await post(app, "/api/applications/does-not-exist/flag-voice", { kind: "resume" });
    expect(res.statusCode).toBe(404);
  });
});

describe("flag-voice — locked-permitted", () => {
  it("returns 200 for BOTH kind:'resume' and kind:'cover-letter' on a LOCKED application", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);
    await seedProfile(app);

    const jdA = CONTRAST_JDS[0]!.jd;
    const { id } = await createTailoredApp(app, jdA);
    await post(app, `/api/applications/${id}/generate-letter`);

    const locked = await post(app, `/api/applications/${id}/lock`);
    expect(locked.statusCode).toBe(200);
    expect(locked.json().locked).not.toBeNull();

    const flagResume = await post(app, `/api/applications/${id}/flag-voice`, { kind: "resume" });
    expect(flagResume.statusCode).toBe(200);

    const flagLetter = await post(app, `/api/applications/${id}/flag-voice`, {
      kind: "cover-letter",
    });
    expect(flagLetter.statusCode).toBe(200);

    const afterFlags = await get(app, "/api/profile");
    expect(afterFlags.json().voiceSources).toHaveLength(2);
  });
});

describe("flag-voice — cap enforcement", () => {
  it("a 6th flag past the cap of 5 -> exact 409 {error:'voice_cap'}; array stays exactly 5, 6th text nowhere", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);
    await seedProfile(app);

    const { id } = await createTailoredApp(app, CONTRAST_JDS[0]!.jd);

    // Drive to the cap with resume flags — the resume's plainText is stable
    // (current doesn't change between calls), so distinguish sources by id.
    for (let i = 0; i < VOICE_SOURCES_CAP; i++) {
      const res = await post(app, `/api/applications/${id}/flag-voice`, { kind: "resume" });
      expect(res.statusCode).toBe(200);
    }

    const atCap = await get(app, "/api/profile");
    const beforeSixth = atCap.json().voiceSources as Profile["voiceSources"];
    expect(beforeSixth).toHaveLength(VOICE_SOURCES_CAP);

    // The 6th flag must be rejected outright — use a DISTINCT kind/source so
    // its text is verifiably unique and absent from storage.
    await post(app, `/api/applications/${id}/generate-letter`);
    const sixth = await post(app, `/api/applications/${id}/flag-voice`, { kind: "cover-letter" });
    expect(sixth.statusCode).toBe(409);
    expect(sixth.json()).toEqual({ error: "voice_cap" });

    const afterSixth = await get(app, "/api/profile");
    const sourcesAfter = afterSixth.json().voiceSources as Profile["voiceSources"];
    expect(sourcesAfter).toHaveLength(VOICE_SOURCES_CAP);
    expect(sourcesAfter).toEqual(beforeSixth); // untouched — no silent evict
    expect(sourcesAfter.every((s) => s.kind === "resume")).toBe(true); // the letter text landed nowhere
  });
});

describe("DELETE /api/profile/voice-sources/:vid", () => {
  it("removes a source by id; a fresh GET confirms it's gone and the others remain", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);
    await seedProfile(app);

    const { id } = await createTailoredApp(app, CONTRAST_JDS[0]!.jd);
    await post(app, `/api/applications/${id}/flag-voice`, { kind: "resume" });
    await post(app, `/api/applications/${id}/generate-letter`);
    await post(app, `/api/applications/${id}/flag-voice`, { kind: "cover-letter" });

    const before = await get(app, "/api/profile");
    const sourcesBefore = before.json().voiceSources as Profile["voiceSources"];
    expect(sourcesBefore).toHaveLength(2);
    const [first, second] = sourcesBefore;

    const del = await app.inject({
      method: "DELETE",
      url: `/api/profile/voice-sources/${first!.id}`,
    });
    expect(del.statusCode).toBe(200);

    const after = await get(app, "/api/profile");
    const sourcesAfter = after.json().voiceSources as Profile["voiceSources"];
    expect(sourcesAfter).toHaveLength(1);
    expect(sourcesAfter.find((s) => s.id === first!.id)).toBeUndefined();
    expect(sourcesAfter.find((s) => s.id === second!.id)).toEqual(second);
  });

  it("a missing id -> 404, array unchanged", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);
    await seedProfile(app);
    const { id } = await createTailoredApp(app, CONTRAST_JDS[0]!.jd);
    await post(app, `/api/applications/${id}/flag-voice`, { kind: "resume" });

    const del = await app.inject({
      method: "DELETE",
      url: "/api/profile/voice-sources/does-not-exist",
    });
    expect(del.statusCode).toBe(404);

    const after = await get(app, "/api/profile");
    expect(after.json().voiceSources).toHaveLength(1);
  });
});
