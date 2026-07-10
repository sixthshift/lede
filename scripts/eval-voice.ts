// Voice-on/off eval — the KEY-GATED "voice works" proof (spec.md §voice; T45).
// THE claim: conditioning on a voice exemplar changes PHRASING ONLY — the
// selection and order of what the resume says (which entries, in what rank)
// must be IDENTICAL voice-on vs voice-off. Voice lends voice, never facts and
// never selection.
//
// Two things make this proof honest, both red-teamed at intake:
//   1. Temperature is PINNED to 0 for BOTH runs. Two live calls almost always
//      differ in wording by sampling noise alone — "strings differ" proves
//      nothing. Pinning temperature makes any phrasing delta INPUT-attributable
//      (the voice block is the only differing input), and the temperature is
//      recorded in the manifest so the pin is auditable.
//   2. Selection+order identity is asserted position-for-position over the full
//      ORDERED (entryId, rank) sequence — not set equality, which would miss a
//      reorder. If voice perturbs selection, that is a real failure (voice
//      leaking past phrasing), and this eval fails rather than papering over it.
//
// Never falls back to FixtureEngine — a missing key is a hard failure, not a
// skip. Calls generateObject directly (like record-letter-fixtures.ts) so the
// SDK's real `usage` is captured for provenance and `temperature` can be pinned
// (ProviderEngine plumbs neither, and engine.ts is out of this ticket's scope) —
// while reusing the REAL prompt builders (buildUserPrompt / buildLetterUserPrompt)
// and system prompts, so what's exercised is the actual composition path.

import { mkdirSync, writeFileSync } from "node:fs";
import { generateObject } from "ai";

import { SEED_ENTRIES } from "../src/server/seed";
import { SECTION_VALUES, SECTIONS } from "../src/shared/sections";
import { resolveModel, providerOptionsFor } from "../src/shared/providers";
import { LetterDecisionZ, TailorDecisionZ } from "../src/shared/schema";
import { SYSTEM_PROMPT, renderLibrary } from "../src/server/tailor/prompt";
import { buildUserPrompt } from "../src/server/tailor/engine";
import { LETTER_SYSTEM_PROMPT, buildLetterUserPrompt } from "../src/server/tailor/letter-prompt";
import { assemble } from "../src/server/tailor/assemble";
import { assembleLetter } from "../src/server/tailor/letter";
import type {
  CoverLetter,
  Layout,
  LetterDecision,
  TailorDecision,
  TailoredResume,
} from "../src/shared/types";

const MODEL = "gemini-2.5-flash";
const PROVIDER = "google" as const;
const TEMPERATURE = 0;

const layout: Layout = [
  { section: "summary", enabled: true },
  ...SECTION_VALUES.map((section) => ({ section, enabled: true })),
];

const JD = `Senior Software Engineer, Platform

We're looking for a senior engineer to lead the modernization of our core
rules engine and internal developer platform. You'll own architecture
decisions, mentor engineers, and drive delivery of high-impact projects that
cut onboarding time and improve reliability. Strong background in platform
architecture, lifecycle frameworks, and shipping under ambiguity required.`;

// A deliberately DISTINCTIVE register: terse, first-person, blunt, em-dash
// heavy, allergic to corporate fluff. Chosen so "did the voice-on output adopt
// this register?" is judgeable by eye, not a coin-flip. Style only — it states
// no facts, so nothing here can (or should) enter grounded output as a claim.
const VOICE = `I build things that work — no fluff, no throat-clearing. I shipped the
thing, it cut the number that mattered, and I moved to the next hard problem.
I don't pad. I ship, I measure, I fix it at 2am, I write the postmortem nobody
asked for. Short sentences. Plain words. Say the result, then stop.`;

type Usage = { inputTokens?: number; outputTokens?: number; totalTokens?: number };

async function callResume(
  voice: string | null,
): Promise<{ decision: TailorDecision; usage: Usage }> {
  const { object, usage } = await generateObject({
    model: resolveModel({
      provider: PROVIDER,
      model: MODEL,
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    }),
    schema: TailorDecisionZ,
    system: `${SYSTEM_PROMPT}\n\n${renderLibrary(SEED_ENTRIES)}`,
    prompt: buildUserPrompt(JD, null, null, voice),
    temperature: TEMPERATURE,
    providerOptions: providerOptionsFor(PROVIDER) as Parameters<
      typeof generateObject
    >[0]["providerOptions"],
  });
  return { decision: object, usage };
}

async function callLetter(
  voice: string | null,
): Promise<{ decision: LetterDecision; usage: Usage }> {
  const { object, usage } = await generateObject({
    model: resolveModel({
      provider: PROVIDER,
      model: MODEL,
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    }),
    schema: LetterDecisionZ,
    system: `${LETTER_SYSTEM_PROMPT}\n\n${renderLibrary(SEED_ENTRIES)}`,
    prompt: buildLetterUserPrompt(JD, null, null, voice),
    temperature: TEMPERATURE,
    providerOptions: providerOptionsFor(PROVIDER) as Parameters<
      typeof generateObject
    >[0]["providerOptions"],
  });
  return { decision: object, usage };
}

// The ordered (entryId, rank) sequence exactly as the decision returned it —
// this is the selection AND the order, compared position-for-position.
function selectionOrder(decision: TailorDecision): string {
  return decision.items.map((i) => `${i.entryId}#${i.rank}`).join(" | ");
}

function itemTexts(decision: TailorDecision): Map<string, string> {
  return new Map(decision.items.map((i) => [i.entryId, i.text]));
}

// The set of entryIds a letter grounds on, across all paragraphs (the letter's
// analog of resume selection; its paragraph structure is the user's, so order
// isn't the invariant — the grounding set is).
function letterGrounding(decision: LetterDecision): string {
  return [...new Set(decision.body.flatMap((p) => p.groundedOn))].sort().join(", ");
}

function letterProse(letter: CoverLetter): string {
  return [letter.greeting, ...letter.body.map((p) => p.text), letter.closing].join("\n\n");
}

function resumeProse(resume: TailoredResume): string {
  const lines = [resume.summary];
  for (const section of resume.sections)
    for (const group of section.groups) for (const item of group.items) lines.push(item.text);
  return lines.join("\n");
}

function sum(a: Usage, b: Usage): Usage {
  return {
    inputTokens: (a.inputTokens ?? 0) + (b.inputTokens ?? 0),
    outputTokens: (a.outputTokens ?? 0) + (b.outputTokens ?? 0),
    totalTokens: (a.totalTokens ?? 0) + (b.totalTokens ?? 0),
  };
}

async function main() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error(
      "eval-voice: GOOGLE_GENERATIVE_AI_API_KEY is not set — refusing to run. " +
        "This oracle is key-gated and never falls back to FixtureEngine; " +
        "set the key to run the live voice-on/off proof.",
    );
    process.exit(1);
  }

  console.log(`\n=== eval-voice (model ${MODEL}, temperature ${TEMPERATURE}) ===`);

  const resumeOff = await callResume(null);
  const resumeOn = await callResume(VOICE);
  const letterOff = await callLetter(null);
  const letterOn = await callLetter(VOICE);

  const resumeAssembledOff = assemble(resumeOff.decision, SEED_ENTRIES, layout, SECTIONS);
  const resumeAssembledOn = assemble(resumeOn.decision, SEED_ENTRIES, layout, SECTIONS);
  const letterAssembledOff = assembleLetter(letterOff.decision);
  const letterAssembledOn = assembleLetter(letterOn.decision);

  // ── resume: the authoritative gate ──
  const selOff = selectionOrder(resumeOff.decision);
  const selOn = selectionOrder(resumeOn.decision);
  const resumeSelectionIdentical = selOff === selOn;
  const cutOff = resumeOff.decision.cut
    .map((c) => c.entryId)
    .sort()
    .join(", ");
  const cutOn = resumeOn.decision.cut
    .map((c) => c.entryId)
    .sort()
    .join(", ");
  const resumeCutIdentical = cutOff === cutOn;

  const textsOff = itemTexts(resumeOff.decision);
  const textsOn = itemTexts(resumeOn.decision);
  const changedItems = [...textsOff.keys()].filter(
    (id) => textsOn.has(id) && textsOff.get(id) !== textsOn.get(id),
  );
  const resumeSummaryChanged = resumeOff.decision.summary !== resumeOn.decision.summary;
  const resumePhrasingDiffers = resumeSummaryChanged || changedItems.length > 0;

  // ── letter: supporting evidence ──
  const letterGroundingIdentical =
    letterGrounding(letterOff.decision) === letterGrounding(letterOn.decision);
  const letterPhrasingDiffers = letterProse(letterAssembledOff) !== letterProse(letterAssembledOn);

  console.log(`\n--- resume ---`);
  console.log(`selection+order identical: ${resumeSelectionIdentical}`);
  console.log(`  off: ${selOff}`);
  console.log(`  on : ${selOn}`);
  console.log(`cut set identical: ${resumeCutIdentical} (off=[${cutOff}] on=[${cutOn}])`);
  console.log(
    `phrasing differs: ${resumePhrasingDiffers} (summary changed=${resumeSummaryChanged}, ${changedItems.length}/${textsOff.size} items reworded)`,
  );
  console.log(`\n--- letter ---`);
  console.log(`grounding set identical: ${letterGroundingIdentical}`);
  console.log(`phrasing differs: ${letterPhrasingDiffers}`);

  const ok =
    resumeSelectionIdentical &&
    resumeCutIdentical &&
    resumePhrasingDiffers &&
    letterGroundingIdentical &&
    letterPhrasingDiffers;

  const recordedAt = new Date().toISOString();
  const usageResume = sum(resumeOff.usage, resumeOn.usage);
  const usageLetter = sum(letterOff.usage, letterOn.usage);

  mkdirSync("test/fixtures/voice", { recursive: true });
  writeFileSync(
    "test/fixtures/voice/manifest.json",
    `${JSON.stringify(
      {
        model: MODEL,
        provider: PROVIDER,
        temperature: TEMPERATURE,
        recordedAt,
        jd: JD,
        voiceExemplar: VOICE,
        usage: { resume: usageResume, letter: usageLetter, total: sum(usageResume, usageLetter) },
        result: {
          resumeSelectionIdentical,
          resumeCutIdentical,
          resumePhrasingDiffers,
          resumeItemsReworded: changedItems.length,
          resumeItemsTotal: textsOff.size,
          resumeSummaryChanged,
          letterGroundingIdentical,
          letterPhrasingDiffers,
          pass: ok,
        },
      },
      null,
      2,
    )}\n`,
  );

  const verdict = ok
    ? "PASS — at pinned temperature 0, the voice block reworded the prose (summary and/or items on the resume; the letter body) while the resume's selection+order (entryId#rank sequence) and cut set stayed byte-identical and the letter's grounding set was unchanged. Phrasing moved; selection did not. VOICE-ON REGISTER (judged): the coordinator confirms below whether the reworded output adopts the exemplar's terse/blunt register — a green `pass` here is the mechanical half only."
    : "FAIL — see the flags; selection perturbed by voice, or phrasing did not move (would indicate no voice effect at temperature 0).";

  writeFileSync(
    "test/fixtures/voice/transcript.md",
    [
      `# Voice on/off eval — ${MODEL} @ temperature ${TEMPERATURE}`,
      ``,
      `Recorded ${recordedAt}. Selection/order asserted position-for-position over the full`,
      `(entryId#rank) sequence; phrasing delta is input-attributable because temperature is pinned.`,
      ``,
      `## Verdict`,
      ``,
      verdict,
      ``,
      `- resume selection+order identical: **${resumeSelectionIdentical}** (\`${selOff}\`)`,
      `- resume cut set identical: **${resumeCutIdentical}**`,
      `- resume phrasing differs: **${resumePhrasingDiffers}** (summary changed=${resumeSummaryChanged}, ${changedItems.length}/${textsOff.size} items reworded)`,
      `- letter grounding set identical: **${letterGroundingIdentical}**`,
      `- letter phrasing differs: **${letterPhrasingDiffers}**`,
      ``,
      `## Resume summary — voice OFF`,
      ``,
      resumeOff.decision.summary,
      ``,
      `## Resume summary — voice ON`,
      ``,
      resumeOn.decision.summary,
      ``,
      `## Resume prose (full) — voice OFF`,
      ``,
      "```",
      resumeProse(resumeAssembledOff),
      "```",
      ``,
      `## Resume prose (full) — voice ON`,
      ``,
      "```",
      resumeProse(resumeAssembledOn),
      "```",
      ``,
      `## Letter — voice OFF`,
      ``,
      "```",
      letterProse(letterAssembledOff),
      "```",
      ``,
      `## Letter — voice ON`,
      ``,
      "```",
      letterProse(letterAssembledOn),
      "```",
      ``,
    ].join("\n"),
  );

  if (!ok) {
    console.error("\neval-voice: FAIL");
    process.exit(1);
  }
  console.log(
    "\neval-voice: PASS — phrasing moved, selection/order held. Provenance + transcript written.",
  );
}

main().catch((err) => {
  console.error("eval-voice: fatal error:", err);
  process.exit(1);
});
