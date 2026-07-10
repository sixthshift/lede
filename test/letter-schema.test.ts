import { describe, it, expect } from "vitest";
import { LetterDecisionZ } from "@shared/schema";
import type { LetterDecision, CoverLetter } from "@shared/types";

// ── LetterDecisionZ ──

function validLetter() {
  return {
    greeting: "Dear Hiring Team,",
    body: [{ text: "I led the migration described in my resume.", groundedOn: ["e1"] }],
    closing: "Sincerely,",
  };
}

describe("LetterDecisionZ", () => {
  it("accepts a valid letter", () => {
    expect(LetterDecisionZ.safeParse(validLetter()).success).toBe(true);
  });

  it("accepts a paragraph with groundedOn: [] (the hand-added-paragraph case)", () => {
    const ok = validLetter();
    ok.body[0].groundedOn = [];
    expect(LetterDecisionZ.safeParse(ok).success).toBe(true);
  });

  it("rejects a letter missing closing", () => {
    const { closing, ...bad } = validLetter();
    expect(LetterDecisionZ.safeParse(bad).success).toBe(false);
  });

  it("rejects a body paragraph with the groundedOn key deleted (not merely undefined)", () => {
    const bad = validLetter();
    delete (bad.body[0] as unknown as Record<string, unknown>).groundedOn;
    expect(LetterDecisionZ.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty body (min(1))", () => {
    const bad = validLetter();
    bad.body = [];
    expect(LetterDecisionZ.safeParse(bad).success).toBe(false);
  });
});

// ── LetterDecision / CoverLetter domain types — hand-declared, not z.infer ──

describe("LetterDecision / CoverLetter domain types", () => {
  it("accepts a fully-populated value as both LetterDecision and CoverLetter", () => {
    const decision: LetterDecision = {
      greeting: "Dear Hiring Team,",
      body: [{ text: "I led the migration.", groundedOn: ["e1"] }],
      closing: "Sincerely,",
    };
    const letter: CoverLetter = {
      greeting: decision.greeting,
      body: decision.body,
      closing: decision.closing,
    };
    expect(letter.closing).toBe("Sincerely,");
  });

  it("rejects a value missing `closing` as LetterDecision at compile time", () => {
    // @ts-expect-error LetterDecision requires `closing`; this object omits it.
    const missingClosing: LetterDecision = {
      greeting: "Dear Hiring Team,",
      body: [{ text: "I led the migration.", groundedOn: ["e1"] }],
    };
    expect(missingClosing.greeting).toBe("Dear Hiring Team,");
  });
});
