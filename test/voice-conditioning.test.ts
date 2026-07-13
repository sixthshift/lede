// T43 — voice conditioning reaches the COMPOSITION INPUT of BOTH documents
// (resume tailor + letter), stays OUT of grounding, and — the single most
// important stability guard — absent voice must leave the composed user
// message byte-identical to today's, so every recorded decision fixture
// keeps replaying untouched.
//
// Five things this file proves, each guarding against a specific way a
// "just plumb it through" change could quietly break the contract:
//   1. GOLDEN byte-identity — buildUserPrompt/buildLetterUserPrompt with no
//      voice reproduce a string literal captured from the PRE-CHANGE source
//      (via `git show HEAD:...` at T43 start), not a value the new code
//      generates for itself.
//   2. A KEYING regression check — FixtureEngine still resolves by
//      hashKey(jd, entries) regardless of the voice argument. This is NOT
//      the byte-identity proof: FixtureEngine never calls buildUserPrompt,
//      so it would pass even if buildUserPrompt were broken.
//   3. END-TO-END plumbing — a spy TailorEngine, driven through the real
//      /tailor and /generate-letter routes, captures the actual composed
//      message the ROUTE caused and shows the voice block appears on BOTH
//      surfaces when profile.voiceSources is set, and on NEITHER when it
//      isn't.
//   4/5. FABRICATION end-to-end on both the resume and letter orchestrators —
//      a voice-only number never satisfies validateNoFabrication /
//      validateLetterNoFabrication, proving voice text never entered the
//      entries/baseSummary grounding args.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import type { Entry, Layout, LetterDecision, TailorDecision } from "@shared/types";
import { initDb, type Db } from "../src/server/db";
import { seedIfEmpty } from "../src/server/seed";
import { profile } from "../src/server/db/schema";
import { SEED_ENTRIES } from "../src/server/seed";
import { CONTRAST_JDS } from "../src/server/tailor/evalcore";
import {
  FixtureEngine,
  tailor,
  buildUserPrompt,
  type TailorEngine,
} from "../src/server/tailor/engine";
import { buildLetterUserPrompt } from "../src/server/tailor/letter-prompt";
import { tailorLetter } from "../src/server/tailor/letter";
import { FabricationError } from "../src/server/tailor/validate";
import { applicationsRoutes } from "../src/server/routes/applications";

const tmpDirs: string[] = [];

function freshDb(): Db {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-voice-conditioning-"));
  tmpDirs.push(dir);
  return initDb(dir).db;
}

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

async function post(app: FastifyInstance, url: string, payload: unknown = {}) {
  return app.inject({ method: "POST", url, payload });
}

function setVoiceSources(db: Db, texts: string[]): void {
  db.update(profile)
    .set({
      voiceSources: texts.map((text, i) => ({
        id: `voice-${i}`,
        kind: "cover-letter" as const,
        text,
        at: Date.now(),
      })),
      updatedAt: Date.now(),
    })
    .where(eq(profile.id, 1))
    .run();
}

// ── 1. GOLDEN byte-identity — captured from the PRE-CHANGE source (T43
// start, `git show HEAD:src/server/tailor/engine.ts` /
// `git show HEAD:src/server/tailor/letter-prompt.ts` before either function
// was touched) by actually calling the then-unmodified functions with these
// fixed inputs. NOT regenerated from the code under test. ──

describe("GOLDEN byte-identity — no voice leaves the composed message unchanged", () => {
  const jd = "GOLDEN_JD: Senior Platform Engineer at Acme.";
  const context = "GOLDEN_CONTEXT: emphasize backend reliability work.";
  const budget = "GOLDEN_BUDGET: ~2 pages, prioritize recent roles.";
  const motivation = "GOLDEN_MOTIVATION: excited about infra scale.";

  const GOLDEN_RESUME_PROMPT =
    "Tailor for this job description:\n\n" +
    "GOLDEN_JD: Senior Platform Engineer at Acme.\n\n" +
    "Tailoring context (guides emphasis; not a source of facts):\n" +
    "GOLDEN_CONTEXT: emphasize backend reliability work.\n\n" +
    "Content budget (approximate — prefer relevance over completeness):\n" +
    "GOLDEN_BUDGET: ~2 pages, prioritize recent roles.";

  const GOLDEN_LETTER_PROMPT =
    "Write a cover letter for this job description:\n\n" +
    "GOLDEN_JD: Senior Platform Engineer at Acme.\n\n" +
    "Motivation (why this candidate wants this role; guides phrasing, not a source of facts):\n" +
    "GOLDEN_MOTIVATION: excited about infra scale.\n\n" +
    "Tailoring context (guides emphasis; not a source of facts):\n" +
    "GOLDEN_CONTEXT: emphasize backend reliability work.";

  it("buildUserPrompt(jd, context, budget) with NO voice arg equals the pre-T43 golden literal char-for-char", () => {
    expect(buildUserPrompt(jd, context, budget)).toBe(GOLDEN_RESUME_PROMPT);
  });

  it("buildUserPrompt(jd, context, budget, voice) with voice OMITTED/undefined/null equals the same golden literal", () => {
    expect(buildUserPrompt(jd, context, budget)).toBe(GOLDEN_RESUME_PROMPT);
    expect(buildUserPrompt(jd, context, budget, undefined)).toBe(GOLDEN_RESUME_PROMPT);
    expect(buildUserPrompt(jd, context, budget, null)).toBe(GOLDEN_RESUME_PROMPT);
    expect(buildUserPrompt(jd, context, budget, "")).toBe(GOLDEN_RESUME_PROMPT);
  });

  it("buildLetterUserPrompt(jd, motivation, context) with NO voice arg equals the pre-T43 golden literal char-for-char", () => {
    expect(buildLetterUserPrompt(jd, motivation, context)).toBe(GOLDEN_LETTER_PROMPT);
  });

  it("buildLetterUserPrompt(jd, motivation, context, voice) with voice OMITTED/undefined/null equals the same golden literal", () => {
    expect(buildLetterUserPrompt(jd, motivation, context)).toBe(GOLDEN_LETTER_PROMPT);
    expect(buildLetterUserPrompt(jd, motivation, context, undefined)).toBe(GOLDEN_LETTER_PROMPT);
    expect(buildLetterUserPrompt(jd, motivation, context, null)).toBe(GOLDEN_LETTER_PROMPT);
    expect(buildLetterUserPrompt(jd, motivation, context, "")).toBe(GOLDEN_LETTER_PROMPT);
  });

  it("WITH a voice arg present, the resume prompt starts with the golden prefix and appends a guarded voice block after it", () => {
    const withVoice = buildUserPrompt(jd, context, budget, "Write punchy, short sentences.");
    expect(withVoice.startsWith(GOLDEN_RESUME_PROMPT)).toBe(true);
    expect(withVoice).toContain("Voice exemplars");
    expect(withVoice).toContain("Write punchy, short sentences.");
  });
});

// ── 2. KEYING regression check ONLY — FixtureEngine matches on
// hashKey(jd, entries), never calls buildUserPrompt/buildLetterUserPrompt,
// so this passes even if buildUserPrompt were broken. It is NOT proof of
// byte-identity (section 1 above is). ──

describe("KEYING regression check — FixtureEngine ignores voice for replay matching (not a byte-identity proof)", () => {
  it("decide(): same fixture resolves regardless of the voice argument", async () => {
    const engine = new FixtureEngine();
    const { jd } = CONTRAST_JDS[0]!;
    const noVoice = await engine.decide(jd, SEED_ENTRIES);
    const withVoice = await engine.decide(
      jd,
      SEED_ENTRIES,
      null,
      null,
      "Some voice exemplar text.",
    );
    expect(withVoice).toEqual(noVoice);
  });

  it("decideLetter(): same fixture resolves regardless of the voice argument", async () => {
    const engine = new FixtureEngine();
    const { jd } = CONTRAST_JDS[0]!;
    const noVoice = await engine.decideLetter(jd, SEED_ENTRIES);
    const withVoice = await engine.decideLetter(
      jd,
      SEED_ENTRIES,
      null,
      null,
      "Some voice exemplar text.",
    );
    expect(withVoice).toEqual(noVoice);
  });
});

// ── 3. END-TO-END plumbing — a spy engine wraps a real FixtureEngine (so
// both routes actually succeed) and records the exact composed message
// each route caused, built from the args the route actually passed. ──

class SpyEngine implements TailorEngine {
  resumePrompts: string[] = [];
  letterPrompts: string[] = [];
  private inner = new FixtureEngine();

  async decide(
    jd: string,
    entries: Entry[],
    context?: string | null,
    budget?: string | null,
    voice?: string | null,
  ): Promise<TailorDecision> {
    this.resumePrompts.push(buildUserPrompt(jd, context, budget, voice));
    return this.inner.decide(jd, entries, context, budget, voice);
  }

  async decideLetter(
    jd: string,
    entries: Entry[],
    motivation?: string | null,
    context?: string | null,
    voice?: string | null,
  ): Promise<LetterDecision> {
    this.letterPrompts.push(buildLetterUserPrompt(jd, motivation, context, voice));
    return this.inner.decideLetter(jd, entries, motivation, context, voice);
  }
}

function appWithSpy(db: Db, engine: SpyEngine): FastifyInstance {
  const app = Fastify();
  applicationsRoutes(app, db, { engine });
  return app;
}

describe("END-TO-END route plumbing — voice reaches BOTH /tailor and /generate-letter's composed message", () => {
  it("WITH profile.voiceSources set, both captured messages contain the voice block", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    setVoiceSources(db, ["Keep sentences short. Lead with impact, not process."]);
    const spy = new SpyEngine();
    const app = appWithSpy(db, spy);

    const { jd } = CONTRAST_JDS[0]!;
    const created = await post(app, "/api/applications", { jobDescription: jd });
    expect(created.statusCode).toBe(200);
    const id = created.json().id as string;

    const tailored = await post(app, `/api/applications/${id}/tailor`);
    expect(tailored.statusCode).toBe(200);
    const lettered = await post(app, `/api/applications/${id}/generate-letter`);
    expect(lettered.statusCode).toBe(200);

    expect(spy.resumePrompts).toHaveLength(1);
    expect(spy.resumePrompts[0]).toContain("Voice exemplars");
    expect(spy.resumePrompts[0]).toContain("Keep sentences short. Lead with impact, not process.");

    expect(spy.letterPrompts).toHaveLength(1);
    expect(spy.letterPrompts[0]).toContain("Voice exemplars");
    expect(spy.letterPrompts[0]).toContain("Keep sentences short. Lead with impact, not process.");
  });

  it("with NO voice sources, neither captured message contains a voice block", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const spy = new SpyEngine();
    const app = appWithSpy(db, spy);

    const { jd } = CONTRAST_JDS[0]!;
    const created = await post(app, "/api/applications", { jobDescription: jd });
    expect(created.statusCode).toBe(200);
    const id = created.json().id as string;

    const tailored = await post(app, `/api/applications/${id}/tailor`);
    expect(tailored.statusCode).toBe(200);
    const lettered = await post(app, `/api/applications/${id}/generate-letter`);
    expect(lettered.statusCode).toBe(200);

    expect(spy.resumePrompts).toHaveLength(1);
    expect(spy.resumePrompts[0]).not.toContain("Voice exemplars");

    expect(spy.letterPrompts).toHaveLength(1);
    expect(spy.letterPrompts[0]).not.toContain("Voice exemplars");
  });
});

// ── 4/5. FABRICATION end-to-end — voice text carrying a number absent from
// every entry's facts (and baseSummary) must NEVER satisfy grounding, on
// EITHER document's real orchestrator. This is not a validate.ts signature
// check: it runs tailor()/tailorLetter() themselves against a stub decision
// that echoes the voice-only number into the document text. ──

const LAYOUT: Layout = [{ section: "experience", enabled: true }];
const VOICE_ONLY_NUMBER = "918273";
const VOICE_TEXT = `Write with energy — we once shipped ${VOICE_ONLY_NUMBER} widgets in a day (just a style note, not a fact).`;
const LEAD_ENTRY = SEED_ENTRIES.find((e) => e.id === "cloudcase-platform-sdk")!;

function makeResumeDecision(overrides: Partial<TailorDecision> = {}): TailorDecision {
  return {
    signals: { roleLevel: "senior", weights: ["platform"], hardRequirements: [] },
    summary: "Built platform tooling.",
    items: [
      {
        entryId: LEAD_ENTRY.id,
        text: "built a platform SDK",
        rank: 1,
        leadRationale: "leads on platform work",
      },
    ],
    // The other two SEED_ENTRIES must land in items OR cut for the partition
    // to be exact (validateDecisionContract now runs in tailor()); cutting
    // them is behavior-neutral for the voice-grounding this suite probes.
    cut: [
      { entryId: "cloudcase-rules-engine", reason: "not this role's lead" },
      { entryId: "cloudcase-frontend-rewrite", reason: "not this role's lead" },
    ],
    ...overrides,
  };
}

describe("FABRICATION end-to-end — a voice-only number never satisfies grounding (resume)", () => {
  it("tailor() throws FabricationError when the decision echoes voice's number into item text", async () => {
    const decision = makeResumeDecision({
      items: [
        {
          entryId: LEAD_ENTRY.id,
          text: `built a platform SDK powering ${VOICE_ONLY_NUMBER} integrations`,
          rank: 1,
        },
      ],
    });
    class StubEngine implements TailorEngine {
      async decide(): Promise<TailorDecision> {
        return decision;
      }
      async decideLetter(): Promise<LetterDecision> {
        throw new Error("not used in this test");
      }
    }
    const engine = new StubEngine();
    await expect(
      tailor(engine, "some jd", SEED_ENTRIES, LAYOUT, undefined, undefined, undefined, VOICE_TEXT),
    ).rejects.toThrow(FabricationError);
  });

  it("sanity: the SAME decision without the voice number passes (proves the failure above is the number, not an unrelated break)", async () => {
    const decision = makeResumeDecision();
    class StubEngine implements TailorEngine {
      async decide(): Promise<TailorDecision> {
        return decision;
      }
      async decideLetter(): Promise<LetterDecision> {
        throw new Error("not used in this test");
      }
    }
    const engine = new StubEngine();
    await expect(
      tailor(engine, "some jd", SEED_ENTRIES, LAYOUT, undefined, undefined, undefined, VOICE_TEXT),
    ).resolves.toBeDefined();
  });
});

describe("FABRICATION end-to-end — a voice-only number never satisfies grounding (letter)", () => {
  it("tailorLetter() throws FabricationError when the decision echoes voice's number into paragraph text", async () => {
    const letterDecision: LetterDecision = {
      greeting: "Dear Hiring Team,",
      body: [
        {
          text: `I helped ship ${VOICE_ONLY_NUMBER} releases with this exact platform work.`,
          groundedOn: [LEAD_ENTRY.id],
        },
      ],
      closing: "Sincerely,",
    };
    class StubEngine implements TailorEngine {
      async decide(): Promise<TailorDecision> {
        throw new Error("not used in this test");
      }
      async decideLetter(): Promise<LetterDecision> {
        return letterDecision;
      }
    }
    const engine = new StubEngine();
    await expect(
      tailorLetter(engine, "some jd", SEED_ENTRIES, undefined, undefined, VOICE_TEXT),
    ).rejects.toThrow(FabricationError);
  });
});
