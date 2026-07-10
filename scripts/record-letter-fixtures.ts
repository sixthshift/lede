// Record cover-letter decision fixtures — spec.md §18, §22 letter analog;
// ailoop T04. Calls the LIVE model once per §22 JD, proves the flip on the
// assembled letter (fabrication-clean, lead paragraph cites the target), and
// ONLY THEN writes the fixture. Never hand-edit a fixture — a failing flip
// is reported, not forced.
//
// Token usage: ProviderEngine.decideLetter (engine.ts) returns only the
// decoded object, not the SDK's `usage`. engine.ts is out of scope for this
// ticket, so this script makes the exact same generateObject call
// ProviderEngine.attemptLetter makes, using the same already-exported
// building blocks, wrapped behind the `LetterRecordEngine` shape
// recordOneLetter expects — that gives real per-call usage without touching
// engine.ts.

import { generateObject } from "ai";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { resolveModel, providerOptionsFor } from "../src/shared/providers";
import { LetterDecisionZ } from "../src/shared/schema";
import { LETTER_SYSTEM_PROMPT, buildLetterUserPrompt } from "../src/server/tailor/letter-prompt";
import { renderLibrary } from "../src/server/tailor/prompt";
import {
  hashKey,
  CONTRAST_JDS,
  recordOneLetter,
  type LetterRecordEngine,
} from "../src/server/tailor/evalcore";
import { SEED_ENTRIES } from "../src/server/seed";

const MODEL = "gemini-2.5-flash";
const PROVIDER = "google" as const;
const FIXTURES_DIR = path.join(process.cwd(), "test/fixtures/letters");

type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

function makeUsageTrackingEngine(
  apiKey: string,
  calls: { name: string; usage: Usage }[],
): {
  engine: LetterRecordEngine;
  withName: (name: string) => LetterRecordEngine;
} {
  let currentName = "";

  const engine: LetterRecordEngine = {
    async decideLetter(jd, entries, motivation, context, voice) {
      const model = resolveModel({ provider: PROVIDER, model: MODEL, apiKey });
      const { object, usage } = await generateObject({
        model,
        schema: LetterDecisionZ,
        system: `${LETTER_SYSTEM_PROMPT}\n\n${renderLibrary(entries)}`,
        prompt: buildLetterUserPrompt(jd, motivation, context, voice),
        providerOptions: providerOptionsFor(PROVIDER) as Parameters<
          typeof generateObject
        >[0]["providerOptions"],
      });
      calls.push({
        name: currentName,
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        },
      });
      return object;
    },
  };

  return {
    engine,
    withName: (name: string) => {
      currentName = name;
      return engine;
    },
  };
}

function sumUsage(calls: { usage: Usage }[]): Usage {
  return calls.reduce<Usage>(
    (acc, c) => ({
      inputTokens: (acc.inputTokens ?? 0) + (c.usage.inputTokens ?? 0),
      outputTokens: (acc.outputTokens ?? 0) + (c.usage.outputTokens ?? 0),
      totalTokens: (acc.totalTokens ?? 0) + (c.usage.totalTokens ?? 0),
    }),
    {},
  );
}

async function main() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    console.error(
      "record-letter-fixtures: GOOGLE_GENERATIVE_AI_API_KEY is not set — aborting (no silent skip).",
    );
    process.exit(1);
  }

  mkdirSync(FIXTURES_DIR, { recursive: true });

  const manifestFixtures: { name: string; key: string; leadingEntryId: string }[] = [];
  const failures: string[] = [];
  const calls: { name: string; usage: Usage }[] = [];
  const { withName } = makeUsageTrackingEngine(apiKey, calls);

  for (const { name, jd, target } of CONTRAST_JDS) {
    console.log(`\n[${name}] requesting live letter decision for target "${target}"...`);

    const result = await recordOneLetter(withName(name), jd, SEED_ENTRIES, target);
    if (!result.ok) {
      failures.push(`${name}: ${result.reason}`);
      console.error(`[${name}] FAIL: ${result.reason}`);
      continue;
    }

    const key = hashKey(jd, SEED_ENTRIES);
    const fixturePath = path.join(FIXTURES_DIR, `${name}.json`);
    writeFileSync(
      fixturePath,
      `${JSON.stringify({ key, name, decision: result.decision }, null, 2)}\n`,
    );
    manifestFixtures.push({ name, key, leadingEntryId: target });
    console.log(`[${name}] PASS: lead paragraph cites "${target}". Wrote ${fixturePath}`);
  }

  const manifest = {
    model: MODEL,
    provider: PROVIDER,
    recordedAt: new Date().toISOString(),
    usage: {
      total: sumUsage(calls),
      perCall: calls,
    },
    fixtures: manifestFixtures,
  };
  writeFileSync(path.join(FIXTURES_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  if (failures.length > 0) {
    console.error(
      `\nrecord-letter-fixtures: ${failures.length} of ${CONTRAST_JDS.length} JD(s) failed to flip:`,
    );
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(
    `\nrecord-letter-fixtures: all ${CONTRAST_JDS.length} letter fixtures recorded and verified.`,
  );
}

main().catch((err) => {
  console.error("record-letter-fixtures: fatal error:", err);
  process.exit(1);
});
