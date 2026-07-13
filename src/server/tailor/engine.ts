// TailorEngine — spec.md §6.1. The model call sits behind this interface so
// tailor() orchestrates engine -> assemble -> validate and is testable, demoable,
// and CI-runnable with no API key. Only ProviderEngine needs one.

import { generateObject } from "ai";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type {
  Entry,
  Layout,
  LetterDecision,
  ProviderId,
  TailorDecision,
  TailoredResume,
} from "@shared/types";
import { SECTIONS } from "@shared/sections";
import { resolveModel, providerOptionsFor } from "@shared/providers";
import { LetterDecisionZ, TailorDecisionZ } from "@shared/schema";
import { SYSTEM_PROMPT, renderLibrary } from "./prompt";
import { LETTER_SYSTEM_PROMPT, buildLetterUserPrompt } from "./letter-prompt";
import { assemble } from "./assemble";
import { validateDecisionContract, validateLedeRationale, validateNoFabrication } from "./validate";
import { hashKey } from "./evalcore";

export interface TailorEngine {
  decide(
    jd: string,
    entries: Entry[],
    context?: string | null,
    budget?: string | null,
    voice?: string | null,
  ): Promise<TailorDecision>;

  decideLetter(
    jd: string,
    entries: Entry[],
    motivation?: string | null,
    context?: string | null,
    voice?: string | null,
  ): Promise<LetterDecision>;
}

// The exact user message ProviderEngine sends. With no context, budget, or
// voice, byte-identical to the pre-context baseline (T014 fixtures/replays
// depend on this). Context appends a clearly-labelled block — context guides
// emphasis, never a fact source (§27), so it's kept visibly separate from the
// JD itself. Budget (§28.5) appends a further block AFTER context, phrasing
// the server-derived content budget. Voice (T43) appends a further block
// AFTER budget — style exemplars only, never a fact source, mirroring
// buildLetterUserPrompt's guarded voice block. Each `!x` guard keeps the
// no-x path byte-identical.
export function buildUserPrompt(
  jd: string,
  context?: string | null,
  budget?: string | null,
  voice?: string | null,
): string {
  const base = `Tailor for this job description:\n\n${jd}`;
  const withContext = !context
    ? base
    : `${base}\n\nTailoring context (guides emphasis; not a source of facts):\n${context}`;
  const withBudget = !budget
    ? withContext
    : `${withContext}\n\nContent budget (approximate — prefer relevance over completeness):\n${budget}`;
  if (!voice) return withBudget;
  return `${withBudget}\n\nVoice exemplars (match this tone/style; not a source of facts):\n${voice}`;
}

// ── real — provider-agnostic via the Vercel AI SDK; production (user's decrypted key) ──
export type ProviderEngineConfig = {
  provider: ProviderId;
  model: string;
  apiKey: string;
  baseURL?: string;
};

export class ProviderEngine implements TailorEngine {
  constructor(private cfg: ProviderEngineConfig) {}

  async decide(
    jd: string,
    entries: Entry[],
    context?: string | null,
    budget?: string | null,
    voice?: string | null,
  ): Promise<TailorDecision> {
    try {
      return await this.attempt(jd, entries, context, budget, voice);
    } catch {
      // retry exactly once; a second failure propagates (route maps it to 502)
      return await this.attempt(jd, entries, context, budget, voice);
    }
  }

  private async attempt(
    jd: string,
    entries: Entry[],
    context?: string | null,
    budget?: string | null,
    voice?: string | null,
  ): Promise<TailorDecision> {
    const model = resolveModel(this.cfg);
    const { object } = await generateObject({
      model,
      schema: TailorDecisionZ,
      system: `${SYSTEM_PROMPT}\n\n${renderLibrary(entries)}`,
      prompt: buildUserPrompt(jd, context, budget, voice),
      providerOptions: providerOptionsFor(this.cfg.provider) as Parameters<
        typeof generateObject
      >[0]["providerOptions"],
    });
    return object;
  }

  async decideLetter(
    jd: string,
    entries: Entry[],
    motivation?: string | null,
    context?: string | null,
    voice?: string | null,
  ): Promise<LetterDecision> {
    try {
      return await this.attemptLetter(jd, entries, motivation, context, voice);
    } catch {
      // retry exactly once; a second failure propagates (route maps it to 502)
      return await this.attemptLetter(jd, entries, motivation, context, voice);
    }
  }

  private async attemptLetter(
    jd: string,
    entries: Entry[],
    motivation?: string | null,
    context?: string | null,
    voice?: string | null,
  ): Promise<LetterDecision> {
    const model = resolveModel(this.cfg);
    const { object } = await generateObject({
      model,
      schema: LetterDecisionZ,
      system: `${LETTER_SYSTEM_PROMPT}\n\n${renderLibrary(entries)}`,
      prompt: buildLetterUserPrompt(jd, motivation, context, voice),
      providerOptions: providerOptionsFor(this.cfg.provider) as Parameters<
        typeof generateObject
      >[0]["providerOptions"],
    });
    return object;
  }
}

// ── keyless — replays a recorded decision (tests / CI / demo); no API key, no cost ──
export class NoFixtureError extends Error {
  code = "no_fixture" as const;
  scenarios: string[];

  constructor(key: string, scenarios: string[]) {
    super(
      `no recorded fixture for key ${key}; recorded scenarios: ${scenarios.join(", ") || "(none)"}`,
    );
    this.name = "NoFixtureError";
    this.scenarios = scenarios;
  }
}

type FixtureFile = { key: string; name?: string; decision: TailorDecision };
type LetterFixtureFile = { key: string; name?: string; decision: LetterDecision };

const DEFAULT_FIXTURES_DIR = path.join(process.cwd(), "test/fixtures/decisions");
export const DEFAULT_LETTER_FIXTURES_DIR = path.join(process.cwd(), "test/fixtures/letters");

export class FixtureEngine implements TailorEngine {
  constructor(
    private dir: string = DEFAULT_FIXTURES_DIR,
    private letterDir: string = DEFAULT_LETTER_FIXTURES_DIR,
  ) {}

  async decide(
    jd: string,
    entries: Entry[],
    _context?: string | null,
    _budget?: string | null,
    _voice?: string | null,
  ): Promise<TailorDecision> {
    // Recorded fixtures key on (jd, entries) only — context/budget/voice
    // never affect replay matching, matching validateNoFabrication's
    // entries-only contract (§28.5: budget rides the prompt, never the
    // replay key; T43: same holds for voice).
    const key = hashKey(jd, entries);
    const fixtures = this.loadFixtures();
    const match = fixtures.find((f) => f.key === key);
    if (!match) {
      throw new NoFixtureError(
        key,
        fixtures.map((f) => f.name ?? f.key),
      );
    }
    return match.decision;
  }

  async decideLetter(
    jd: string,
    entries: Entry[],
    _motivation?: string | null,
    _context?: string | null,
    _voice?: string | null,
  ): Promise<LetterDecision> {
    // Recorded fixtures key on (jd, entries) only — motivation/context/voice
    // never affect replay matching, exactly like decide() ignores
    // context/budget for fixture matching.
    const key = hashKey(jd, entries);
    const fixtures = this.loadFixturesFrom<LetterFixtureFile>(this.letterDir);
    const match = fixtures.find((f) => f.key === key);
    if (!match) {
      throw new NoFixtureError(
        key,
        fixtures.map((f) => f.name ?? f.key),
      );
    }
    return match.decision;
  }

  private loadFixtures(): FixtureFile[] {
    return this.loadFixturesFrom<FixtureFile>(this.dir);
  }

  private loadFixturesFrom<T>(dir: string): T[] {
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    } catch {
      return [];
    }
    const fixtures: T[] = [];
    for (const f of files) {
      try {
        fixtures.push(JSON.parse(readFileSync(path.join(dir, f), "utf-8")) as T);
      } catch (err) {
        // A concurrent writer/deleter in the shared fixtures dir can leave this file
        // partial, empty, or gone between readdirSync and readFileSync — skip it rather
        // than aborting the whole scan. A genuinely corrupt recorded fixture still
        // surfaces here, in logs, instead of being silently dropped.
        console.warn(
          `FixtureEngine: skipping unreadable fixture ${path.join(dir, f)}: ${(err as Error).message}`,
        );
      }
    }
    return fixtures;
  }
}

// ── orchestration — engine-agnostic, deterministic, keyless-testable ──
export async function tailor(
  engine: TailorEngine,
  jd: string,
  entries: Entry[],
  layout: Layout,
  baseSummary?: string | null,
  context?: string | null,
  budget?: string | null,
  voice?: string | null,
): Promise<TailoredResume> {
  const decision = await engine.decide(jd, entries, context, budget, voice);
  // Flat contract checks (partition + rank) run on the RAW decision, before
  // assemble() — no self-repair, no extra model retry on a violation (§6.1);
  // decide() already retried once internally, so a violation here just throws.
  validateDecisionContract(decision, entries);
  const resume = assemble(decision, entries, layout, SECTIONS);
  // validateNoFabrication takes entries (+baseSummary) only — context and
  // voice guide emphasis/phrasing, never a fact source (§27; T43), so
  // neither is ever checked against as if it were one.
  validateNoFabrication(resume, entries, baseSummary);
  validateLedeRationale(resume);
  return resume;
}

// ── engine selection — spec.md §6.1, §17 ──
export function makeEngine(env: NodeJS.ProcessEnv = process.env): TailorEngine {
  const mode = env.LEDE_TAILOR_ENGINE ?? (env.NODE_ENV === "test" ? "fixture" : "live");

  if (mode === "live") {
    return new ProviderEngine({
      provider: "google",
      model: "gemini-2.5-flash",
      apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY ?? "",
    });
  }

  return new FixtureEngine();
}
