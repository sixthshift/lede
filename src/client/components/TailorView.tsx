// Owns JD state + tailor call lifecycle — spec.md §13, §15.

import { useState } from "react";
import type { TailoredResume } from "@shared/types";
import { tailor, ApiError } from "../api";
import { JDInput } from "./JDInput";
import { ResultView } from "./ResultView";

export function TailorView() {
  const [jobDescription, setJobDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resume, setResume] = useState<TailoredResume | null>(null);

  async function handleSubmit() {
    setPending(true);
    setError(null);
    try {
      const result = await tailor(jobDescription);
      setResume(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="tailor-view">
      <JDInput
        value={jobDescription}
        onChange={setJobDescription}
        onSubmit={handleSubmit}
        pending={pending}
      />

      {pending ? <p className="tailor-view__pending">Tailoring your resume…</p> : null}
      {error ? <p className="tailor-view__error">{error}</p> : null}

      {resume ? <ResultView resume={resume} /> : null}
    </div>
  );
}
