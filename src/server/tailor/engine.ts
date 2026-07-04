// TailorEngine — spec.md §6.1. The model call sits behind this interface so
// tailor() orchestrates engine -> assemble -> validate and is testable, demoable,
// and CI-runnable with no API key. Only ProviderEngine needs one.

import { generateObject } from "ai";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Entry, Layout, ProviderId, TailorDecision, TailoredResume } from "@shared/types";
import { SECTIONS } from "@shared/sections";
import { resolveModel, providerOptionsFor } from "@shared/providers";
import { TailorDecisionZ } from "@shared/schema";
import { SYSTEM_PROMPT, renderLibrary } from "./prompt";
import { assemble } from "./assemble";
import { validateNoFabrication } from "./validate";
import { hashKey } from "./evalcore";

export interface TailorEngine {
  decide(jd: string, entries: Entry[], context?: string | null): Promise<TailorDecision>;
}

// The exact user message ProviderEngine sends. With no context, byte-identical
// to the pre-context baseline (T014 fixtures/replays depend on this). With
// context, appends a clearly-labelled block — context guides emphasis, never
// a fact source (§27), so it's kept visibly separate from the JD itself.
export function buildUserPrompt(jd: string, context?: string | null): string {
  const base = `Tailor for this job description:\n\n${jd}`;
  if (!context) return base;
  return `${base}\n\nTailoring context (guides emphasis; not a source of facts):\n${context}`;
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

  async decide(jd: string, entries: Entry[], context?: string | null): Promise<TailorDecision> {
    try {
      return await this.attempt(jd, entries, context);
    } catch {
      // retry exactly once; a second failure propagates (route maps it to 502)
      return await this.attempt(jd, entries, context);
    }
  }

  private async attempt(
    jd: string,
    entries: Entry[],
    context?: string | null,
  ): Promise<TailorDecision> {
    const model = resolveModel(this.cfg);
    const { object } = await generateObject({
      model,
      schema: TailorDecisionZ,
      system: `${SYSTEM_PROMPT}\n\n${renderLibrary(entries)}`,
      prompt: buildUserPrompt(jd, context),
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

const DEFAULT_FIXTURES_DIR = path.join(process.cwd(), "test/fixtures/decisions");

export class FixtureEngine implements TailorEngine {
  constructor(private dir: string = DEFAULT_FIXTURES_DIR) {}

  async decide(jd: string, entries: Entry[], _context?: string | null): Promise<TailorDecision> {
    // Recorded fixtures key on (jd, entries) only — context never affects
    // replay matching, matching validateNoFabrication's entries-only contract.
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

  private loadFixtures(): FixtureFile[] {
    let files: string[];
    try {
      files = readdirSync(this.dir).filter((f) => f.endsWith(".json"));
    } catch {
      return [];
    }
    const fixtures: FixtureFile[] = [];
    for (const f of files) {
      try {
        fixtures.push(JSON.parse(readFileSync(path.join(this.dir, f), "utf-8")) as FixtureFile);
      } catch (err) {
        // A concurrent writer/deleter in the shared fixtures dir can leave this file
        // partial, empty, or gone between readdirSync and readFileSync — skip it rather
        // than aborting the whole scan. A genuinely corrupt recorded fixture still
        // surfaces here, in logs, instead of being silently dropped.
        console.warn(
          `FixtureEngine: skipping unreadable fixture ${path.join(this.dir, f)}: ${(err as Error).message}`,
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
): Promise<TailoredResume> {
  const decision = await engine.decide(jd, entries, context);
  const resume = assemble(decision, entries, layout, SECTIONS);
  // validateNoFabrication takes entries only — context guides emphasis, never
  // a fact source (§27), so it must never be checked against as if it were one.
  validateNoFabrication(resume, entries, baseSummary);
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
