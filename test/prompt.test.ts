import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT, renderRephrasePolicy, renderLibrary } from "../src/server/tailor/prompt";
import { SECTIONS } from "@shared/sections";
import type { Entry } from "@shared/types";

describe("SYSTEM_PROMPT", () => {
  it("is a frozen string with no JD/timestamp interpolation", () => {
    expect(typeof SYSTEM_PROMPT).toBe("string");
    expect(SYSTEM_PROMPT).not.toMatch(/\$\{/); // no unresolved template placeholders leaked into the built string
    expect(SYSTEM_PROMPT.toLowerCase()).not.toContain("job description:"); // that's the volatile user prompt, not this
  });

  it("covers facts-not-tags, the fact-lock, and structural ownership", () => {
    expect(SYSTEM_PROMPT).toMatch(/never.*tags/i);
    expect(SYSTEM_PROMPT).toMatch(/never invent/i);
    expect(SYSTEM_PROMPT).toMatch(/contributed to/i);
    expect(SYSTEM_PROMPT).toMatch(/leadRationale/);
    expect(SYSTEM_PROMPT).toMatch(/rank/);
  });

  it("embeds the live rephrase policy generated from the section registry", () => {
    expect(SYSTEM_PROMPT).toContain(renderRephrasePolicy(SECTIONS));
  });
});

describe("renderRephrasePolicy — derived from SECTIONS, not hardcoded", () => {
  it("reflects a flipped rephrase value when SECTIONS is swapped", () => {
    const original = renderRephrasePolicy(SECTIONS);
    const flipped = {
      ...SECTIONS,
      certification: { ...SECTIONS.certification, rephrase: "full" as const },
    };
    const flippedText = renderRephrasePolicy(flipped);

    expect(flippedText).not.toBe(original);
    // the flipped section's line must now advertise "full", not the original "none"
    const certLine = flippedText.split("\n").find((l) => l.includes('"certification"'))!;
    expect(certLine).toContain("full");
    expect(certLine).not.toContain(": none");
  });

  it("every section label from the registry appears in the rendered policy", () => {
    const text = renderRephrasePolicy(SECTIONS);
    for (const section of Object.keys(SECTIONS) as (keyof typeof SECTIONS)[]) {
      expect(text).toContain(SECTIONS[section].label);
    }
  });
});

function entry(overrides: Partial<Entry> & Pick<Entry, "id" | "sortKey">): Entry {
  return {
    section: "experience",
    meta: { section: "experience", company: "Acme", role: "Eng", period: "2020-2021" },
    facts: [`fact for ${overrides.id}`],
    tags: ["some-tag"],
    ...overrides,
  } as Entry;
}

describe("renderLibrary — determinism", () => {
  const a = entry({ id: "aaa", sortKey: 202101, section: "experience" });
  const b = entry({ id: "bbb", sortKey: 202503, section: "experience" });
  const c = entry({
    id: "ccc",
    sortKey: 202001,
    section: "project",
    meta: { section: "project", name: "Widget" },
  });
  const d = entry({
    id: "ddd",
    sortKey: 202001,
    section: "experience",
    meta: { section: "experience", company: "Acme", role: "Eng", period: "2020-2021" },
  });

  it("orders by section (registry order), then sortKey desc, then id", () => {
    const rendered = renderLibrary([a, b, c, d]);
    const idOrder = [a.id, b.id, c.id, d.id]
      .map((id) => ({ id, index: rendered.indexOf(`] ${id}`) }))
      .sort((x, y) => x.index - y.index)
      .map((x) => x.id);
    // experience (registry order before project): b (202503) > a (202101) > d (202001, tie-break by id 'aaa' < 'ddd' -> a before d)
    // then project: c
    expect(idOrder).toEqual(["bbb", "aaa", "ddd", "ccc"]);
  });

  it("scrambled input orderings all produce byte-identical output", () => {
    const canonical = renderLibrary([a, b, c, d]);
    const scrambled1 = renderLibrary([d, c, b, a]);
    const scrambled2 = renderLibrary([c, a, d, b]);
    expect(scrambled1).toBe(canonical);
    expect(scrambled2).toBe(canonical);
  });
});

describe("renderLibrary — facts foregrounded, tags not framed as a match target", () => {
  it("contains every fact string verbatim", () => {
    const e = entry({
      id: "facty",
      sortKey: 202401,
      facts: ["led rollout of the new pipeline", "cut latency by 30%"],
      tags: ["backend", "infra"],
    });
    const rendered = renderLibrary([e]);
    for (const fact of e.facts) {
      expect(rendered).toContain(fact);
    }
  });

  it("never instructs the reader to match tags against the job description", () => {
    const e = entry({ id: "tagged", sortKey: 202401, tags: ["platform-arch"] });
    const rendered = renderLibrary([e]);
    expect(rendered).toContain("platform-arch"); // tags are shown...
    expect(rendered.toLowerCase()).not.toMatch(/match.{0,30}tags?/); // ...but never framed as something to match
    expect(rendered.toLowerCase()).not.toMatch(/tags?.{0,30}match/);
  });
});
