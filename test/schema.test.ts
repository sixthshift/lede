import { describe, it, expect } from "vitest";
import {
  TailorDecisionZ,
  entryMetaZ,
  entryInput,
  profileInput,
  settingsInput,
  applicationCreate,
  applicationUpdate,
} from "@shared/schema";

// ── TailorDecisionZ ──

function validDecision() {
  return {
    signals: { roleLevel: "senior", weights: ["backend"], hardRequirements: ["5+ years"] },
    summary: "Backend engineer with a track record of shipping.",
    items: [
      {
        entryId: "e1",
        text: "Led a team of 5.",
        rank: 1,
        leadRationale: "Strongest leadership signal.",
      },
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

// ── entryInput: §17 bounds (drizzle-zod can't infer these; must survive derivation) ──

describe("entryInput §17 bounds", () => {
  it("rejects facts.length > 12", () => {
    const bad = {
      section: "experience",
      meta: experienceMeta(),
      facts: Array.from({ length: 13 }, (_, i) => `fact ${i}`),
      tags: [],
      sortKey: 202001,
    };
    expect(entryInput.safeParse(bad).success).toBe(false);
  });

  it("rejects a tag longer than 40 chars", () => {
    const bad = {
      section: "experience",
      meta: experienceMeta(),
      facts: ["led team"],
      tags: ["x".repeat(41)],
      sortKey: 202001,
    };
    expect(entryInput.safeParse(bad).success).toBe(false);
  });

  it("rejects a meta string longer than 120 chars", () => {
    const bad = {
      section: "experience",
      meta: { ...experienceMeta(), company: "x".repeat(121) },
      facts: ["led team"],
      tags: [],
      sortKey: 202001,
    };
    expect(entryInput.safeParse(bad).success).toBe(false);
  });

  it("rejects a foreign meta field", () => {
    const bad = {
      section: "experience",
      meta: { ...experienceMeta(), notAField: "nope" },
      facts: ["led team"],
      tags: [],
      sortKey: 202001,
    };
    expect(entryInput.safeParse(bad).success).toBe(false);
  });

  it("accepts a fully valid entry at the bounds", () => {
    const ok = {
      section: "experience",
      meta: experienceMeta(),
      facts: ["led team"],
      tags: ["backend"],
      sortKey: 202001,
    };
    expect(entryInput.safeParse(ok).success).toBe(true);
  });
});

// ── profileInput ──

describe("profileInput", () => {
  function validProfile() {
    return {
      name: "Jane Doe",
      email: "jane@example.com",
      links: [{ type: "github" as const, label: "GitHub", url: "https://github.com/jane" }],
    };
  }

  it("accepts a valid profile payload", () => {
    expect(profileInput.safeParse(validProfile()).success).toBe(true);
  });

  it("rejects a profile missing required 'name'", () => {
    const { name, ...bad } = validProfile();
    expect(profileInput.safeParse(bad).success).toBe(false);
  });

  it("rejects a link with an invalid 'type'", () => {
    const bad = validProfile();
    (bad.links[0] as unknown as { type: string }).type = "twitter";
    expect(profileInput.safeParse(bad).success).toBe(false);
  });
});

// ── settingsInput ──

describe("settingsInput", () => {
  it("accepts a valid settings payload", () => {
    const ok = {
      provider: "anthropic",
      model: "claude-opus-4-8",
      layout: [{ section: "summary" as const, enabled: true }],
    };
    expect(settingsInput.safeParse(ok).success).toBe(true);
  });

  it("accepts an empty (all-optional) settings payload", () => {
    expect(settingsInput.safeParse({}).success).toBe(true);
  });

  it("rejects a layout entry with an invalid section", () => {
    const bad = { layout: [{ section: "not-a-section", enabled: true }] };
    expect(settingsInput.safeParse(bad).success).toBe(false);
  });
});

// ── applicationCreate / applicationUpdate (§27) ──

describe("applicationCreate", () => {
  it("accepts jobDescription alone (company/role/context optional)", () => {
    expect(applicationCreate.safeParse({ jobDescription: "We are hiring..." }).success).toBe(true);
  });

  it("accepts jobDescription plus optional company/role/context", () => {
    const ok = {
      jobDescription: "We are hiring...",
      company: "Acme Corp",
      role: "Senior Backend Engineer",
      context: "Emphasize distributed systems.",
    };
    expect(applicationCreate.safeParse(ok).success).toBe(true);
  });

  it("rejects a missing jobDescription", () => {
    expect(applicationCreate.safeParse({ company: "Acme Corp" }).success).toBe(false);
  });

  it("rejects an empty jobDescription", () => {
    expect(applicationCreate.safeParse({ jobDescription: "" }).success).toBe(false);
  });

  it("rejects a jobDescription over 20000 chars", () => {
    expect(applicationCreate.safeParse({ jobDescription: "x".repeat(20001) }).success).toBe(false);
  });
});

describe("applicationUpdate", () => {
  it("accepts an empty (all-optional) payload", () => {
    expect(applicationUpdate.safeParse({}).success).toBe(true);
  });

  it("accepts a partial update of just company", () => {
    expect(applicationUpdate.safeParse({ company: "New Co" }).success).toBe(true);
  });

  it("rejects an empty-string jobDescription when provided", () => {
    expect(applicationUpdate.safeParse({ jobDescription: "" }).success).toBe(false);
  });
});
