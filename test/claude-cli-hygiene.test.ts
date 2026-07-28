// T010 — campaign-closing hygiene: the claude-cli stub is opt-in PER TEST, the
// helper writes only into os.tmpdir(), and fixture mode is still the
// zero-config default that outranks the configured provider.
//
// Why a whole file for this: every other campaign test proves its own claude-cli
// behaviour by PREPENDING the fake binary to PATH. The risk that creates is
// tree-wide rather than per-file — one line in a global config (vitest/vite
// setup, or the Playwright webServer env) would silently put the stub in front
// of every test in the suite, and each individual file would still pass. So the
// invariants here are structural: nothing global wires the stub, no PRE-EXISTING
// test file consumes it, and the keyless fixture default that makes the suite
// runnable with no API key at all is intact.
//
// PROOF OWNERSHIP — stated so nothing here is mistaken for a stronger claim:
//   * Full keyless greenness of the whole unit/component suite (`bunx vitest
//     run`) and of all three Playwright projects with no API key and no real
//     `claude` binary is proven by the campaign's own seeded checks and gate —
//     `unit-and-component-suite`, `spa-bundle-builds`,
//     `e2e-applications-workspace`, `e2e-library-settings-auth`. This file
//     deliberately does NOT re-run them.
//   * "git diff over pre-existing test files is empty" is enforced by campaign
//     review of the merged diff, plus the fact that no ticket in the campaign
//     named a pre-existing test file as a deliverable. This file contributes
//     only the structural half of that: no global prepend (§1) and no
//     pre-existing consumer of the helper (§2).
//
// Also note: this dev container ships a REAL `claude` on PATH, so no assertion
// here may assume the binary is absent. The one case that needs absence
// REPLACES PATH with a claude-free directory (`pathWithoutClaude()`).

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import Fastify, { type FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/server/config";
import { initDb, type Db } from "../src/server/db";
import { settings } from "../src/server/db/schema";
import { buildApp } from "../src/server/index";
import { applicationsRoutes } from "../src/server/routes/applications";
import { seedIfEmpty } from "../src/server/seed";
import { CONTRAST_JDS } from "../src/server/tailor/evalcore";
import {
  type ClaudeStub,
  installClaudeStub,
  pathWithoutClaude,
  pathWithStub,
} from "./helpers/claude-stub";

const repoRoot = path.join(__dirname, "..");
const read = (relPath: string) => readFileSync(path.join(repoRoot, relPath), "utf-8");

// The four files that get loaded for EVERY test, in either runner. A stub
// prepend or a PATH assignment in any of them stops being opt-in.
const GLOBAL_CONFIGS = [
  "vitest.config.ts",
  "vite.config.ts",
  "test/setup.ts",
  "playwright.config.ts",
] as const;

// vite.config.ts's vitest `exclude` carries this glob so ailoop fan-out
// worktrees (`.claude/...`) never get collected. It is a DIRECTORY pattern for
// an agent scratch tree, not a reference to a `claude` binary or to the stub —
// the only sanctioned occurrence of the substring in a global config, and §1
// pins its count so a second one cannot slip in unnoticed.
const AILOOP_WORKTREE_GLOB = '"**/.claude/**"';

const HELPER_MODULE = "helpers/claude-stub";

// The campaign's own new test files — the complete allowlist of files permitted
// to consume the stub helper. Every other file under test/ is pre-existing.
const CAMPAIGN_TEST_FILES = [
  "test/providers-claude-cli.test.ts",
  "test/claude-cli-engine.test.ts",
  "test/claude-cli-failures.test.ts",
  "test/claude-cli-prompt-parity.test.ts",
  "test/api.claude-cli-tailor.test.ts",
  "test/api.claude-cli-test-connection.test.ts",
  "test/api.claude-cli-settings.test.ts",
  "test/settings-claude-cli.test.tsx",
  "test/docs-claude-cli.test.ts",
  "test/e2e/claude-cli-settings.spec.ts",
  "test/claude-cli-hygiene.test.ts",
] as const;

// The importers, pinned EXACTLY as they stand — a proper subset of the
// allowlist above, because four campaign files (the provider-registry unit
// test, the settings route/UI tests, and the docs test) exercise claude-cli
// without ever spawning a binary, so they have no use for the stub. Pinning the
// observed set exactly, rather than merely asserting "subset of the allowlist",
// catches drift in BOTH directions: a new consumer appearing outside the
// campaign, and a campaign file quietly losing the stub it should be using.
// (Equality against the full 11-file allowlist would simply be false.)
const EXPECTED_STUB_IMPORTERS = [
  "test/api.claude-cli-tailor.test.ts",
  "test/api.claude-cli-test-connection.test.ts",
  "test/claude-cli-engine.test.ts",
  "test/claude-cli-failures.test.ts",
  "test/claude-cli-hygiene.test.ts",
  "test/claude-cli-prompt-parity.test.ts",
  "test/e2e/claude-cli-settings.spec.ts",
] as const;

// A source file "imports the helper" when it names it in an import specifier —
// not merely when the string appears in prose. The helper's own header comment
// mentions its path, and a text search alone would count that as a consumer.
const IMPORT_SPECIFIER = /from\s+"([^"]+)"/g;

function testTreeFiles(): string[] {
  return readdirSync(path.join(repoRoot, "test"), { recursive: true, encoding: "utf-8" })
    .map((entry) => path.join("test", entry))
    .filter((rel) => /\.(?:ts|tsx)$/.test(rel))
    .filter((rel) => statSync(path.join(repoRoot, rel)).isFile())
    .sort();
}

function stubImporters(): string[] {
  return testTreeFiles()
    .filter((rel) => {
      const specifiers = [...read(rel).matchAll(IMPORT_SPECIFIER)].map((match) => match[1]!);
      return specifiers.some((spec) => spec.endsWith(HELPER_MODULE));
    })
    .sort();
}

const SAVED_ENV_KEYS = [
  "PATH",
  "NODE_ENV",
  "LEDE_TAILOR_ENGINE",
  "LEDE_STUB_RECORD",
  "LEDE_STUB_MODE",
  "LEDE_STUB_PAYLOAD",
] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of SAVED_ENV_KEYS) savedEnv[key] = process.env[key];
});

// Restoring PATH and LEDE_TAILOR_ENGINE is what makes this file safe to run in
// the same process as the rest of the campaign (acceptance check 2 runs them
// together precisely to catch a file that doesn't).
afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("§1 no global config prepends the stub or touches PATH for the whole suite", () => {
  it.each(GLOBAL_CONFIGS)("%s names neither the stub helper nor a claude binary", (relPath) => {
    const source = read(relPath);
    expect(source).not.toContain(HELPER_MODULE);
    expect(source).not.toContain("claude-stub");

    // Strip the one sanctioned occurrence, then require the substring to be
    // gone entirely — case-insensitive, so `Claude`/`CLAUDE` in a comment or an
    // env name would fail too.
    const globCount = source.split(AILOOP_WORKTREE_GLOB).length - 1;
    expect(globCount).toBe(relPath === "vite.config.ts" ? 1 : 0);
    expect(source.split(AILOOP_WORKTREE_GLOB).join("")).not.toMatch(/claude/i);
  });

  it.each(GLOBAL_CONFIGS)("%s contains no PATH assignment at all", (relPath) => {
    // Case-sensitive and unanchored: `process.env.PATH`, a `PATH:` key in a
    // webServer env block, and a bare `PATH` in a comment all trip it. The
    // lowercase `node:path` imports these files legitimately use do not.
    expect(read(relPath)).not.toContain("PATH");
  });

  it("CONTROL: the same scans DO fire on the stub helper itself", () => {
    // Without this, both scans above could be passing because the regexes are
    // wrong rather than because the configs are clean.
    const helper = read("test/helpers/claude-stub.ts");
    expect(helper).toContain("PATH");
    expect(helper).toMatch(/claude/i);
    expect(helper.split(AILOOP_WORKTREE_GLOB).join("")).toMatch(/claude/i);
  });

  it("test/setup.ts sets only the operator secrets and the auth flag", () => {
    // Pins the assignment set positively, so a future addition to the global
    // setup has to be looked at rather than merely not containing "PATH".
    const assigned = [...read("test/setup.ts").matchAll(/process\.env\.([A-Z0-9_]+)\s*=/g)]
      .map((match) => match[1]!)
      .sort();
    expect(assigned).toEqual(["LEDE_AUTH_DISABLED", "LEDE_MASTER_KEY", "LEDE_SESSION_SECRET"]);
  });

  it("playwright.config.ts's per-server env blocks carry no PATH", () => {
    const source = read("playwright.config.ts");
    const envKeys = [...source.matchAll(/^\s{8}([A-Z][A-Z0-9_]*)[:,]/gm)].map((match) => match[1]!);
    // Positive control that the scan is actually reading the env blocks.
    expect(envKeys).toContain("LEDE_MASTER_KEY");
    expect(envKeys).toContain("LEDE_TAILOR_ENGINE");
    expect(envKeys).not.toContain("PATH");
  });
});

describe("§2 the stub helper is opt-in: only the campaign's own tests import it", () => {
  it("every campaign file in the allowlist exists, so the allowlist is not vacuous", () => {
    for (const rel of CAMPAIGN_TEST_FILES) {
      expect(existsSync(path.join(repoRoot, rel)), rel).toBe(true);
    }
  });

  it("the set of importers is exactly the pinned set", () => {
    expect(stubImporters()).toEqual([...EXPECTED_STUB_IMPORTERS].sort());
  });

  it("every importer is one of the campaign's own new test files", () => {
    // The invariant that matters: no PRE-EXISTING test file consumes the stub.
    for (const rel of stubImporters()) {
      expect(CAMPAIGN_TEST_FILES as readonly string[], rel).toContain(rel);
    }
  });

  it("the scan really does see the whole test tree", () => {
    // Guards the two assertions above against a readdir that silently returned
    // a handful of files: the tree is large, nested, and includes this file.
    const files = testTreeFiles();
    expect(files.length).toBeGreaterThan(80);
    expect(files).toContain("test/claude-cli-hygiene.test.ts");
    expect(files).toContain("test/helpers/claude-stub.ts");
    expect(files).toContain("test/e2e/claude-cli-settings.spec.ts");
  });
});

describe("§3 the helper is hermetic: everything it creates lives in os.tmpdir() and is removed", () => {
  it("installs an executable claude under the real tmpdir, records into it, and cleans up fully", () => {
    const realTmp = realpathSync(os.tmpdir());
    // `test/helpers` is where a sloppy helper would most plausibly drop a file
    // (next to itself); snapshot it around the whole install/run/cleanup arc.
    const helpersBefore = readdirSync(path.join(repoRoot, "test/helpers")).sort();

    const stub = installClaudeStub();
    const binPath = path.join(stub.dir, "claude");
    const claudeFree = pathWithoutClaude();

    // Under tmpdir, and demonstrably OUTSIDE the repository — the two halves of
    // "no repository state is touched".
    for (const created of [stub.dir, binPath, stub.recordPath, claudeFree]) {
      expect(realpathSync(path.dirname(created)).startsWith(realTmp), created).toBe(true);
      expect(path.relative(repoRoot, created).startsWith(".."), created).toBe(true);
    }

    expect(statSync(binPath).isFile()).toBe(true);
    // Owner-executable: the engine spawns it by name off PATH, so the mode bit
    // is load-bearing, not cosmetic.
    expect(statSync(binPath).mode & 0o100).toBe(0o100);
    expect(existsSync(stub.recordPath)).toBe(false);
    expect(stub.readRecords()).toEqual([]);

    // Run it once, from inside its own directory, to prove the recording file
    // it creates also lands in tmp. `prose` is the one mode that needs no
    // LEDE_STUB_PAYLOAD file, so the spawn stays a pure hermeticity check.
    const run = spawnSync(binPath, ["--model", "sonnet"], {
      cwd: stub.dir,
      input: "",
      encoding: "utf-8",
      env: {
        ...process.env,
        PATH: pathWithStub(stub.dir),
        LEDE_STUB_RECORD: stub.recordPath,
        LEDE_STUB_MODE: "prose",
      },
    });
    expect(run.status).toBe(0);
    expect(existsSync(stub.recordPath)).toBe(true);
    const records = stub.readRecords();
    expect(records).toHaveLength(1);
    expect(records[0]!.argv).toEqual(["--model", "sonnet"]);

    stub.cleanup();

    expect(existsSync(stub.recordPath)).toBe(false);
    expect(existsSync(binPath)).toBe(false);
    expect(existsSync(stub.dir)).toBe(false);
    // pathWithoutClaude()'s directory is drained by the same cleanup(), so the
    // helper as a whole leaves nothing behind.
    expect(existsSync(claudeFree)).toBe(false);
    expect(readdirSync(path.join(repoRoot, "test/helpers")).sort()).toEqual(helpersBefore);
  });

  it("two installs are independent directories, and cleanup() is idempotent", () => {
    const first = installClaudeStub();
    const second = installClaudeStub();
    expect(first.dir).not.toBe(second.dir);

    first.cleanup();
    expect(existsSync(first.dir)).toBe(false);
    // The claude-free pool is shared, so the first cleanup drains it; the second
    // must still not throw on an already-removed directory.
    expect(() => first.cleanup()).not.toThrow();
    expect(existsSync(second.dir)).toBe(true);

    second.cleanup();
    expect(existsSync(second.dir)).toBe(false);
  });
});

describe("§4 fixture-first is still the zero-config default", () => {
  const BOOT_ENV = {
    LEDE_MASTER_KEY: randomBytes(32).toString("base64"),
    LEDE_SESSION_SECRET: "hygiene-session-secret-at-least-32-characters-long",
  };

  it("loadConfig defaults tailorEngine to 'fixture' under NODE_ENV=test and 'live' otherwise", () => {
    // loadConfig takes its env explicitly, so this reads the real parse
    // behaviour without mutating the process (which the whole suite shares).
    expect(loadConfig({ ...BOOT_ENV, NODE_ENV: "test" }).tailorEngine).toBe("fixture");
    expect(loadConfig({ ...BOOT_ENV, NODE_ENV: "production" }).tailorEngine).toBe("live");
    expect(loadConfig({ ...BOOT_ENV, NODE_ENV: undefined }).tailorEngine).toBe("live");
    // An explicit value still wins in both directions.
    expect(
      loadConfig({ ...BOOT_ENV, NODE_ENV: "test", LEDE_TAILOR_ENGINE: "live" }).tailorEngine,
    ).toBe("live");
    expect(
      loadConfig({ ...BOOT_ENV, NODE_ENV: "production", LEDE_TAILOR_ENGINE: "fixture" })
        .tailorEngine,
    ).toBe("fixture");
  });
});

// The route-level half of §4: resolveEngine's fixture short-circuit sits BEFORE
// its claude-cli branch. The nearest stable boundary a unit test has for that
// ordering is the OUTCOME under a configuration both branches would claim —
// provider claude-cli with no `claude` on PATH at all. Fixture-first means a
// tailored resume; claude-cli-first would mean a 502 binary_missing. The
// negative control (same setup, live mode) produces exactly that 502, which is
// what makes the positive cases evidence of ordering rather than of a route
// that simply cannot fail.
describe("§4 resolveEngine evaluates fixture BEFORE the claude-cli branch", () => {
  const stubs: ClaudeStub[] = [];
  const dataDirs: string[] = [];
  const handles: Database.Database[] = [];

  afterEach(() => {
    while (stubs.length) stubs.pop()!.cleanup();
    while (handles.length) handles.pop()!.close();
    // This file's own artifacts live in tmpdir and leave with it, same contract
    // the stub helper holds itself to.
    while (dataDirs.length) rmSync(dataDirs.pop()!, { recursive: true, force: true });
  });

  // A stub is installed but deliberately kept OFF PATH: its recording file is
  // the witness that nothing spawned a CLI. PATH itself is replaced with a
  // claude-free directory so the real container `claude` is unreachable too.
  function claudeFreeStub(): ClaudeStub {
    const stub = installClaudeStub();
    stubs.push(stub);
    process.env.LEDE_STUB_RECORD = stub.recordPath;
    process.env.LEDE_STUB_MODE = "library-derived";
    process.env.PATH = pathWithoutClaude();
    return stub;
  }

  function claudeCliDb(): Db {
    const dir = mkdtempSync(path.join(os.tmpdir(), "lede-hygiene-"));
    dataDirs.push(dir);
    const { db, sqlite } = initDb(dir);
    handles.push(sqlite);
    seedIfEmpty(db);
    db.update(settings)
      .set({ provider: "claude-cli", model: "sonnet", updatedAt: Date.now() })
      .where(eq(settings.id, 1))
      .run();
    return db;
  }

  async function tailorFixtureJd(app: FastifyInstance) {
    const created = await app.inject({
      method: "POST",
      url: "/api/applications",
      payload: { jobDescription: CONTRAST_JDS[0]!.jd },
    });
    expect(created.statusCode).toBe(200);
    return app.inject({
      method: "POST",
      url: `/api/applications/${created.json().id}/tailor`,
      payload: {},
    });
  }

  it("zero config (NODE_ENV=test, LEDE_TAILOR_ENGINE unset) tailors through fixtures, not the missing binary", async () => {
    const stub = claudeFreeStub();
    // The end-to-end form of the loadConfig assertion above: the route reads
    // process.env per request, so deleting the override is the real
    // zero-configuration boot. NODE_ENV is set explicitly because that — not
    // "running under vitest" — is what parseTailorEngine keys the default on;
    // vitest itself leaves NODE_ENV at "development" in this container, so the
    // suite's own keylessness rides on LEDE_TAILOR_ENGINE=fixture coming from
    // the ambient environment rather than on this default. Stated rather than
    // papered over; the default itself is what this ticket is asked to pin.
    process.env.NODE_ENV = "test";
    delete process.env.LEDE_TAILOR_ENGINE;

    const res = await tailorFixtureJd(buildApp(claudeCliDb()));
    expect(res.statusCode).toBe(200);
    expect(res.json().genState).toBe("tailored");
    expect(res.json().current).not.toBeNull();
    expect(stub.readRecords()).toEqual([]);
  });

  it("an injected fixture config outranks LEDE_TAILOR_ENGINE=live and still precedes claude-cli", async () => {
    const stub = claudeFreeStub();
    process.env.LEDE_TAILOR_ENGINE = "live";

    const app = Fastify();
    applicationsRoutes(app, claudeCliDb(), { config: { tailorEngine: "fixture" } });

    const res = await tailorFixtureJd(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().genState).toBe("tailored");
    expect(stub.readRecords()).toEqual([]);
  });

  it("CONTROL: the identical setup in live mode DOES fail on the missing binary", async () => {
    const stub = claudeFreeStub();
    process.env.LEDE_TAILOR_ENGINE = "live";

    const res = await tailorFixtureJd(buildApp(claudeCliDb()));
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: "claude_cli_binary_missing" });
    expect(stub.readRecords()).toEqual([]);
  });
});
