import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  tokenize,
  rationaleReferencesPhrase,
  uncoveredSignals,
} from "../src/shared/signal-coverage";
import { flipPredicate } from "../src/server/tailor/evalcore";
import type { TailoredGroup, TailoredItem, TailoredResume } from "@shared/types";

// ── fixture builders ──

function item(entryId: string, text: string): TailoredItem {
  return { entryId, text };
}

function group(items: TailoredItem[], leadRationale?: string): TailoredGroup {
  return { heading: "group", leadRationale, items };
}

function resume(signals: TailoredResume["signals"], groups: TailoredGroup[]): TailoredResume {
  return {
    signals,
    summary: "summary",
    sections: [{ section: "experience", groups }],
    cut: [],
  };
}

// ── uncoveredSignals ──

describe("uncoveredSignals", () => {
  it("weights: one lede rationale naming one signal leaves the other uncovered", () => {
    const signals = {
      roleLevel: "senior",
      weights: ["platform SDK productization", "API versioning"],
      hardRequirements: [],
    };
    const r = resume(signals, [
      group([item("e1", "shipped a client SDK for partners")], "led the platform SDK effort"),
    ]);
    expect(uncoveredSignals(r)).toEqual(["API versioning"]);
  });

  it("weights: a second lede rationale naming the remaining signal clears it", () => {
    const signals = {
      roleLevel: "senior",
      weights: ["platform SDK productization", "API versioning"],
      hardRequirements: [],
    };
    const r = resume(signals, [
      group([item("e1", "shipped a client SDK for partners")], "led the platform SDK effort"),
      group([item("e2", "designed stable contracts")], "introduced API versioning discipline"),
    ]);
    expect(uncoveredSignals(r)).toEqual([]);
  });

  it("hardRequirements: named by no lede rationale -> present in uncovered", () => {
    const signals = { roleLevel: "senior", weights: [], hardRequirements: ["distributed systems"] };
    const r = resume(signals, [group([item("e1", "some work")], "generic rationale")]);
    expect(uncoveredSignals(r)).toEqual(["distributed systems"]);
  });

  it("hardRequirements: named by a lede rationale -> absent from uncovered", () => {
    const signals = { roleLevel: "senior", weights: [], hardRequirements: ["distributed systems"] };
    const r = resume(signals, [group([item("e1", "some work")], "owned our distributed systems")]);
    expect(uncoveredSignals(r)).toEqual([]);
  });

  it("roleLevel is excluded from the candidate set entirely", () => {
    const signals = {
      roleLevel: "principal engineer",
      weights: ["testing rigor"],
      hardRequirements: [],
    };
    const r = resume(signals, [
      // rationale shares no token with roleLevel and does not name the one weight either
      group([item("e1", "generic work")], "generic filler rationale"),
    ]);
    const uncovered = uncoveredSignals(r);
    expect(uncovered).not.toContain(signals.roleLevel);
    expect(uncovered).toEqual(["testing rigor"]);
  });

  it("lede-only: a non-lede item naming the signal (outside group.leadRationale) does not cover it", () => {
    const signals = {
      roleLevel: "senior",
      weights: ["container orchestration"],
      hardRequirements: [],
    };
    const r = resume(signals, [
      group(
        [
          item("e1", "generic lede text"), // items[0] = the lede
          item("e2", "ran container orchestration for years"), // non-lede item names the signal
        ],
        "generic rationale not naming the signal",
      ),
    ]);
    expect(uncoveredSignals(r)).toEqual(["container orchestration"]);
  });

  it("text-not-rationale: a signal token verbatim in the LEDE's own .text (not in any leadRationale) still reads uncovered", () => {
    const signals = {
      roleLevel: "senior",
      weights: ["container orchestration"],
      hardRequirements: [],
    };
    const r = resume(signals, [
      group(
        [item("e1", "led container orchestration initiatives")], // lede's TEXT names it
        "generic rationale not naming the signal", // but the leadRationale does not
      ),
    ]);
    expect(uncoveredSignals(r)).toEqual(["container orchestration"]);
  });

  it("dedup: the same phrase in both weights and hardRequirements appears exactly once", () => {
    const signals = {
      roleLevel: "senior",
      weights: ["distributed systems"],
      hardRequirements: ["distributed systems"],
    };
    const r = resume(signals, [group([item("e1", "some work")], "generic rationale")]);
    expect(uncoveredSignals(r)).toEqual(["distributed systems"]);
  });

  it("documented-limit: two signals sharing only an incidental >=4-char token both read covered", () => {
    const signals = {
      roleLevel: "senior",
      weights: ["container orchestration", "container deposit tracking"],
      hardRequirements: [],
    };
    const r = resume(signals, [
      group([item("e1", "some work")], "owned our container rollout end to end"),
    ]);
    expect(uncoveredSignals(r)).toEqual([]);
  });
});

// ── rationaleReferencesPhrase / tokenize (the shared primitive itself) ──

describe("rationaleReferencesPhrase", () => {
  it("matches on a shared >=4-char token, case-insensitively", () => {
    expect(
      rationaleReferencesPhrase("Led the Platform SDK rollout", "platform SDK productization"),
    ).toBe(true);
  });

  it("does not match on tokens shorter than 4 chars", () => {
    // "API" tokenizes to "api" (3 chars) — too short to count on its own.
    expect(rationaleReferencesPhrase("worked on many things", "API")).toBe(false);
  });

  it("tokenize lowercases and splits on non-alphanumeric runs", () => {
    expect(tokenize("API-versioning, v2!")).toEqual(["api", "versioning", "v2"]);
  });
});

// ── single-source proof ──

describe("single source (evalcore reuses the shared matcher)", () => {
  it("evalcore.ts imports the matcher from @shared/signal-coverage and defines no local tokenizer", () => {
    const evalcorePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../src/server/tailor/evalcore.ts",
    );
    const src = readFileSync(evalcorePath, "utf8");
    expect(src).toMatch(/from ["']@shared\/signal-coverage["']/);
    expect(src).toMatch(/rationaleReferencesPhrase/);
    expect(src).not.toMatch(/function tokenize/);
  });

  it("differential: evalcore's flipPredicate and the shared rationaleReferencesPhrase agree on the incidental-token case", () => {
    const phrase = "container orchestration";
    const rationale = "owned our container rollout end to end";

    // the shared primitive says this is a match purely on the >=4-char token overlap
    expect(rationaleReferencesPhrase(rationale, phrase)).toBe(true);

    // flipPredicate must reach the SAME verdict via evalcore's private
    // rationaleReferencesSignal, which now delegates to the shared primitive
    const r = resume({ roleLevel: "senior", weights: [phrase], hardRequirements: [] }, [
      group([item("target", "some lede text")], rationale),
    ]);
    const { rationaleNamesSignal } = flipPredicate(r, "target");
    expect(rationaleNamesSignal).toBe(true);
  });
});
