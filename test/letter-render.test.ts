// Letter render smoke test (T21, mirrors test/document-render.test.ts):
// renderLetterToBuffer over a recorded fixture (test/fixtures/letters/) is a
// non-empty, real PDF; title/author track profile.name — asserted against
// TWO DISTINCT profiles so a hardcoded literal can't pass both.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CoverLetter, Profile } from "@shared/types";
import { loadPdfDocument } from "../src/client/document/extractText";
import { renderLetterToBuffer } from "../src/client/document/renderLetter";

function loadFixture(name: string): CoverLetter {
  const raw = readFileSync(join(__dirname, "fixtures/letters", `${name}.json`), "utf-8");
  return JSON.parse(raw).decision as CoverLetter;
}

function profileA(): Profile {
  return {
    name: "Jordan Rivera",
    email: "jordan@example.com",
    phone: "555-0100",
    location: "Remote",
    links: [{ type: "github", label: "github.com/jordan", url: "https://github.com/jordan" }],
  };
}

function profileB(): Profile {
  return {
    name: "Priya Natarajan",
    email: "priya@example.com",
    phone: "555-0199",
    location: "Austin, TX",
    links: [
      { type: "linkedin", label: "linkedin.com/in/priya", url: "https://linkedin.com/in/priya" },
    ],
  };
}

describe("renderLetterToBuffer (T21)", () => {
  it("renders a non-empty, real PDF over a recorded fixture", async () => {
    const buffer = await renderLetterToBuffer({
      letter: loadFixture("platform-sdk"),
      profile: profileA(),
    });
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });

  it("sets Document title/author to profile.name for TWO distinct profiles", async () => {
    const letter = loadFixture("platform-sdk");

    const bufferA = await renderLetterToBuffer({ letter, profile: profileA() });
    const bufferB = await renderLetterToBuffer({ letter, profile: profileB() });

    const docA = await loadPdfDocument(bufferA);
    const docB = await loadPdfDocument(bufferB);
    const metaA = (await docA.getMetadata()).info as { Title?: string; Author?: string };
    const metaB = (await docB.getMetadata()).info as { Title?: string; Author?: string };

    expect(metaA.Title).toBe(profileA().name);
    expect(metaA.Author).toBe(profileA().name);
    expect(metaB.Title).toBe(profileB().name);
    expect(metaB.Author).toBe(profileB().name);
  });
});
