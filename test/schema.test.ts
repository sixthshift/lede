import { describe, it, expect } from "vitest";
import { TailorDecisionZ, entryMetaZ, entryInput } from "@shared/schema";

// ── TailorDecisionZ ──

function validDecision() {
  return {
    signals: { roleLevel: "senior", weights: ["backend"], hardRequirements: ["5+ years"] },
    summary: "Backend engineer with a track record of shipping.",
    items: [
      { entryId: "e1", text: "Led a team of 5.", rank: 1, leadRationale: "Strongest leadership signal." },
    ],
    cut: [{ entryId: "e2", reason: "Not relevant to backend role." }],
  };
}

describe("TailorDecisionZ", () => {
  it("accepts one fully-populated valid decision", () => {
    expect(TailorDecisionZ.safeParse(validDecision()).success).toBe(true);
  });

  it("rejects empty entryId", () => {
    const bad = validDecision();
    bad.items[0].entryId = "";
    expect(TailorDecisionZ.safeParse(bad).success).toBe(false);
  });

  it("rejects non-numeric rank", () => {
    const bad = validDecision();
    (bad.items[0] as unknown as { rank: unknown }).rank = "first";
    expect(TailorDecisionZ.safeParse(bad).success).toBe(false);
  });

  it("rejects missing signals.hardRequirements", () => {
    const bad = validDecision();
    delete (bad.signals as unknown as Record<string, unknown>).hardRequirements;
    expect(TailorDecisionZ.safeParse(bad).success).toBe(false);
  });

  it("rejects a cut entry missing reason", () => {
    const bad = validDecision();
    delete (bad.cut[0] as unknown as Record<string, unknown>).reason;
    expect(TailorDecisionZ.safeParse(bad).success).toBe(false);
  });
});

// ── entryMetaZ strictness ──

function experienceMeta() {
  return { section: "experience" as const, company: "Acme", role: "Engineer", period: "2020-2021" };
}

describe("entryMetaZ", () => {
  it("passes a canonical 'experience' meta", () => {
    expect(entryMetaZ.safeParse(experienceMeta()).success).toBe(true);
  });

  it("rejects the same object plus a foreign field (school)", () => {
    const withForeign = { ...experienceMeta(), school: "MIT" };
    expect(entryMetaZ.safeParse(withForeign).success).toBe(false);
  });

  it("rejects experience meta missing 'role'", () => {
    const { role, ...withoutRole } = experienceMeta();
    expect(entryMetaZ.safeParse(withoutRole).success).toBe(false);
  });
});

// ── entryInput: facts arity + meta/section agreement ──

describe("entryInput facts arity + section/meta agreement", () => {
  it("rejects a 'skill' entry with 2 facts (label sections require exactly 1)", () => {
    const bad = {
      section: "skill",
      meta: { section: "skill" },
      facts: ["TypeScript", "JavaScript"],
      tags: [],
      sortKey: 1,
    };
    expect(entryInput.safeParse(bad).success).toBe(false);
  });

  it("accepts a 'skill' entry with exactly 1 fact", () => {
    const ok = {
      section: "skill",
      meta: { section: "skill" },
      facts: ["TypeScript"],
      tags: [],
      sortKey: 1,
    };
    expect(entryInput.safeParse(ok).success).toBe(true);
  });

  it("rejects an 'experience' entry with 0 facts", () => {
    const bad = {
      section: "experience",
      meta: experienceMeta(),
      facts: [],
      tags: [],
      sortKey: 202001,
    };
    expect(entryInput.safeParse(bad).success).toBe(false);
  });

  it("accepts a 'certification' entry with [] facts", () => {
    const ok = {
      section: "certification",
      meta: { section: "certification", name: "AWS SAA" },
      facts: [],
      tags: [],
      sortKey: 202001,
    };
    expect(entryInput.safeParse(ok).success).toBe(true);
  });

  it("rejects when meta.section !== section", () => {
    const bad = {
      section: "experience",
      meta: { section: "certification", name: "AWS SAA" },
      facts: ["led team"],
      tags: [],
      sortKey: 202001,
    };
    expect(entryInput.safeParse(bad).success).toBe(false);
  });
});
