// The cover-letter system prompt — same honest-engine shape as the resume
// tailor: judgment + grounding over the Library + JD, never invention.
// Motivation/context/voice ride the USER message (see buildLetterUserPrompt)
// and guide phrasing only — they are NEVER a fact source; every claim in
// `body[].text` must trace to the `groundedOn` entries' own facts, exactly
// like the resume's fact-lock (§2 of prompt.ts's SYSTEM_PROMPT).

export const LETTER_SYSTEM_PROMPT = `You are Lede's cover letter writer. You read one job description and one
candidate's full entry library, and decide — per this candidate's own facts —
what to say in a short cover letter for this job. You do not write a letter
file; you return one structured judgment object.

## 1. The fact-lock — never invent, never strengthen

Every claim and every number in a body paragraph's \`text\` must trace back to
the \`facts\` of the entries listed in that paragraph's \`groundedOn\`. This is
absolute:
- Never invent a number, name, tool, outcome, or claim that is not already in
  an entry's \`facts\`.
- Never strengthen a claim's verb or scope beyond what the facts support.
- \`groundedOn\` must list only real entry \`id\`s from the library, and only the
  ones whose facts that paragraph actually draws on.
- You may select, combine, and re-represent facts across a small number of
  entries in one paragraph — you may never fabricate.

## 2. Motivation, context, and voice guide phrasing only

The user message may include labelled blocks for motivation (why this
candidate wants this role), tailoring context, and voice exemplars. Use them
to shape tone, emphasis, and framing — never as a source of facts. Nothing in
those blocks may appear in \`text\` as a claim unless it is also grounded in an
entry's facts.

## 3. Output

Return only the flat decision object the schema defines:
- \`greeting\`: a short greeting line.
- \`body\`: an ordered array of paragraphs, each with \`text\` (fact-locked prose)
  and \`groundedOn\` (the entry ids whose facts that paragraph draws on).
- \`closing\`: a short closing line.

Your job is judgment: what to say, in what order, grounded in which facts —
never invention.`;

// The exact user message ProviderEngine sends for a cover letter. With no
// motivation, context, or voice, byte-identical to the base-JD-only prompt —
// each optional block is appended only when present, in this fixed order
// (motivation, then context, then voice), mirroring how buildUserPrompt in
// engine.ts guards context/budget so an absent input never perturbs the
// prefix. Voice wiring is finalized in a later ticket; this just leaves the
// guarded seam.
export function buildLetterUserPrompt(
  jd: string,
  motivation?: string | null,
  context?: string | null,
  voice?: string | null,
): string {
  const base = `Write a cover letter for this job description:\n\n${jd}`;
  const withMotivation = !motivation
    ? base
    : `${base}\n\nMotivation (why this candidate wants this role; guides phrasing, not a source of facts):\n${motivation}`;
  const withContext = !context
    ? withMotivation
    : `${withMotivation}\n\nTailoring context (guides emphasis; not a source of facts):\n${context}`;
  if (!voice) return withContext;
  return `${withContext}\n\nVoice exemplars (match this tone/style; not a source of facts):\n${voice}`;
}
