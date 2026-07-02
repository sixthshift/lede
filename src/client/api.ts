// Typed client for the tailor endpoint (spec.md §9, §15).

import type { TailoredResume } from "@shared/types";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function tailor(jobDescription: string): Promise<TailoredResume> {
  const res = await fetch("/api/tailor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobDescription }),
  });

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) {
        code = body.error;
        message = body.error;
      }
    } catch {
      // body wasn't JSON — fall back to the generic message above.
    }
    throw new ApiError(res.status, message, code);
  }

  return (await res.json()) as TailoredResume;
}
