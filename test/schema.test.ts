import { describe, it, expect } from "vitest";
import {
  TailorDecisionZ,
  entryMetaZ,
  entryInput,
  entryImport,
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

// ── skill/language meta.level: numeric CONTENT, 1–5 (§31.4) ──

describe("entryMetaZ — skill/language meta.level", () => {
  it("accepts a skill with an omitted level (unleveled entries stay valid)", () => {
    expect(entryMetaZ.safeParse({ section: "skill" }).success).toBe(true);
  });

  it("accepts a skill with a numeric level of 3", () => {
    expect(entryMetaZ.safeParse({ section: "skill", level: 3 }).success).toBe(true);
  });

  it("rejects a skill with a string level (the old free-text shape)", () => {
    expect(entryMetaZ.safeParse({ section: "skill", level: "expert" }).success).toBe(false);
  });

  it("rejects a skill level outside 1–5", () => {
    expect(entryMetaZ.safeParse({ section: "skill", level: 0 }).success).toBe(false);
    expect(entryMetaZ.safeParse({ section: "skill", level: 6 }).success).toBe(false);
  });

  it("rejects a non-integer skill level", () => {
    expect(entryMetaZ.safeParse({ section: "skill", level: 2.5 }).success).toBe(false);
  });

  it("accepts a language with an omitted level (unleveled entries stay valid)", () => {
    expect(entryMetaZ.safeParse({ section: "language" }).success).toBe(true);
  });

  it("accepts a language with a numeric level of 5", () => {
    expect(entryMetaZ.safeParse({ section: "language", level: 5 }).success).toBe(true);
  });

  it("rejects a language with a string level (the old free-text shape)", () => {
    expect(entryMetaZ.safeParse({ section: "language", level: "fluent" }).success).toBe(false);
  });
});

// ── entryInput / entryImport: a STRING level fails the full parse; numeric passes ──

describe("entryInput — meta.level parse (§31.4)", () => {
  it("rejects a skill entry whose level is a string", () => {
    const bad = {
      section: "skill",
      meta: { section: "skill", level: "expert" },
      facts: ["TypeScript"],
      tags: [],
      sortKey: 1,
    };
    expect(entryInput.safeParse(bad).success).toBe(false);
  });

  it("accepts a skill entry whose level is numeric (3)", () => {
    const ok = {
      section: "skill",
      meta: { section: "skill", level: 3 },
      facts: ["TypeScript"],
      tags: [],
      sortKey: 1,
    };
    expect(entryInput.safeParse(ok).success).toBe(true);
  });

  it("accepts a skill entry with no level at all", () => {
    const ok = {
      section: "skill",
      meta: { section: "skill" },
      facts: ["TypeScript"],
      tags: [],
      sortKey: 1,
    };
    expect(entryInput.safeParse(ok).success).toBe(true);
  });

  it("rejects a language entry whose level is a string, via entryImport too", () => {
    const bad = [
      {
        section: "language",
        meta: { section: "language", level: "fluent" },
        facts: ["Spanish"],
        tags: [],
        sortKey: 1,
      },
    ];
    expect(entryImport.safeParse(bad).success).toBe(false);
  });
});

// ── §31.4 data migration (drizzle/0004): a pre-existing STRING level must be
// cleared on boot so the row parses under the new numeric schema ──

describe("drizzle/0004 — meta.level string-to-cleared migration", () => {
  it(
    "is registered in the journal and picked up on boot: applying it clears a string level " +
      "but leaves a numeric level intact",
    async () => {
      const { mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } = await import(
        "node:fs"
      );
      const { tmpdir } = await import("node:os");
      const path = await import("node:path");
      const Database = (await import("better-sqlite3")).default;
      const { drizzle } = await import("drizzle-orm/better-sqlite3");
      const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
      const schema = await import("../src/server/db/schema");

      const projectDrizzleDir = path.join(process.cwd(), "drizzle");
      const migrationFile = readdirSync(projectDrizzleDir).find((f) => f.startsWith("0004_"));
      expect(migrationFile, "a 0004_*.sql migration must exist").toBeDefined();

      const journal = JSON.parse(
        readFileSync(path.join(projectDrizzleDir, "meta", "_journal.json"), "utf-8"),
      );
      const entry0004 = journal.entries.find((e: { idx: number }) => e.idx === 4);
      expect(entry0004, "0004 must be registered in meta/_journal.json").toBeDefined();
      expect(entry0004.tag).toBe(migrationFile!.replace(/\.sql$/, ""));

      // Apply only migrations 0000-0003 first, from a scratch copy — this
      // reproduces "an existing install that hasn't seen 0004 yet."
      const dbFile = path.join(mkdtempSync(path.join(tmpdir(), "lede-migration-")), "lede.sqlite");
      const sqlite = new Database(dbFile);
      const db = drizzle(sqlite, { schema });

      const priorDir = mkdtempSync(path.join(tmpdir(), "lede-prior-migrations-"));
      mkdirSync(path.join(priorDir, "meta"));
      const priorEntries = journal.entries.filter((e: { idx: number }) => e.idx < 4);
      for (const e of priorEntries) {
        writeFileSync(
          path.join(priorDir, `${e.tag}.sql`),
          readFileSync(path.join(projectDrizzleDir, `${e.tag}.sql`)),
        );
      }
      writeFileSync(
        path.join(priorDir, "meta", "_journal.json"),
        JSON.stringify({
          version: journal.version,
          dialect: journal.dialect,
          entries: priorEntries,
        }),
      );
      migrate(db, { migrationsFolder: priorDir });

      // Insert rows shaped like pre-ticket data: a string skill level and a
      // string language level (both must be cleared), plus a numeric skill
      // level (must survive untouched — the guard is json_type = 'text' only).
      const now = Date.now();
      const insert = sqlite.prepare(
        `INSERT INTO entries (id, section, meta, facts, tags, sort_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      insert.run(
        "skill-dirty",
        "skill",
        JSON.stringify({ section: "skill", level: "expert" }),
        JSON.stringify(["Rust"]),
        JSON.stringify([]),
        1,
        now,
        now,
      );
      insert.run(
        "lang-dirty",
        "language",
        JSON.stringify({ section: "language", level: "fluent" }),
        JSON.stringify(["Spanish"]),
        JSON.stringify([]),
        1,
        now,
        now,
      );
      insert.run(
        "skill-numeric",
        "skill",
        JSON.stringify({ section: "skill", level: 4 }),
        JSON.stringify(["Go"]),
        JSON.stringify([]),
        1,
        now,
        now,
      );

      // Now migrate against the REAL project drizzle/ folder — 0000-0003 are
      // already applied (by timestamp), so only 0004 runs, proving it's the
      // one that's registered and picked up on boot (mirrors migrateDb()).
      migrate(db, { migrationsFolder: "drizzle" });

      const rows = sqlite
        .prepare(
          "SELECT id, meta FROM entries WHERE id IN ('skill-dirty','lang-dirty','skill-numeric')",
        )
        .all() as { id: string; meta: string }[];
      const metaById = new Map(rows.map((r) => [r.id, JSON.parse(r.meta)]));

      expect(metaById.get("skill-dirty").level).toBeUndefined();
      expect(metaById.get("lang-dirty").level).toBeUndefined();
      expect(metaById.get("skill-numeric").level).toBe(4);

      // The cleared rows now parse under the new numeric-only schema.
      expect(entryMetaZ.safeParse(metaById.get("skill-dirty")).success).toBe(true);
      expect(entryMetaZ.safeParse(metaById.get("lang-dirty")).success).toBe(true);
      expect(entryMetaZ.safeParse(metaById.get("skill-numeric")).success).toBe(true);

      sqlite.close();
    },
  );
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
