// The Claude Code (CLI) provider's contract with an operator lives in two
// places that no runtime test can reach: a README section (what auth is, where
// it runs, how the live path gets smoke-tested) and the *absence* of the binary
// from the shipped image. Both are file contents, so both are checkable here.
//
// Scope note: `.devcontainer/` deliberately preinstalls the CLI for
// development and is NOT the shipped image — every claude-free assertion below
// is pinned to the root Dockerfile, docker-compose.yml, and the one spec the
// docker Playwright project matches.
//
// Known limit, stated rather than papered over: this file proves the image
// *inputs* carry no `claude`. It does not prove the runtime behaviour "a bare
// container fails loud" — that is the engine's ENOENT → `binary_missing` case
// (test/claude-cli-failures.test.ts) plus the route's `claude_cli_binary_missing`
// 502 mapping (test/api.claude-cli-tailor.test.ts). Running a container stays a
// milestone gate (`bun run test:docker`), not a per-change check.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "..");
const read = (relPath: string) => readFileSync(join(repoRoot, relPath), "utf-8");

const README_HEADING = "## Claude Code (CLI)";

const claudeCliSection = () => {
  const readme = read("README.md");
  const start = readme.indexOf(README_HEADING);
  if (start === -1) return null;
  const next = readme.indexOf("\n## ", start + README_HEADING.length);
  return readme.slice(start, next === -1 ? undefined : next);
};

describe("README documents the Claude Code (CLI) provider", () => {
  it("has the section", () => {
    expect(claudeCliSection()).not.toBeNull();
  });

  it("names subscription auth: `claude login` state or CLAUDE_CODE_OAUTH_TOKEN, no key stored", () => {
    const section = claudeCliSection() ?? "";
    expect(section).toContain("claude login");
    expect(section).toContain("CLAUDE_CODE_OAUTH_TOKEN");
    expect(section).toMatch(/no API key is (kept|stored)/i);
  });

  it("states it is host-run only and not installed in the Docker image", () => {
    const section = claudeCliSection() ?? "";
    expect(section).toMatch(/host-run only/i);
    expect(section).toMatch(/not in the Docker image/i);
    expect(section).toContain("claude_cli_binary_missing");
  });

  it("gives the manual live-smoke instruction — one real tailor on a logged-in machine", () => {
    const section = claudeCliSection() ?? "";
    expect(section).toMatch(/live smoke is manual/i);
    expect(section).toMatch(/logged-in machine/i);
    expect(section).toMatch(/one real tailor/i);
  });

  it("does not tell the reader to install the binary or to enter a token in the UI", () => {
    const section = claudeCliSection() ?? "";
    // Auto-detect / auto-install is out of scope, and there is no token-entry
    // UI — the token is a host env var only.
    expect(section).not.toMatch(/npm (i|install) -g|brew install|curl [^\n]*\| *(ba)?sh/i);
    expect(section).toMatch(/no token field in the UI/i);
  });
});

describe("the shipped image inputs carry no claude binary", () => {
  const shippedImageInputs = ["Dockerfile", "docker-compose.yml", "test/e2e/docker-spa.spec.ts"];

  for (const relPath of shippedImageInputs) {
    it(`${relPath} has no claude reference`, () => {
      expect(read(relPath)).not.toMatch(/claude/i);
    });
  }
});
