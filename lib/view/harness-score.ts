export interface HarnessResult {
  q: string;
  missing: string[];
  pass: boolean;
}

/**
 * The grader, and deliberately the whole of it: a question passes when every
 * keyword appears somewhere in the reply, case-insensitive. Grading with a
 * model would make the score depend on the thing being measured.
 */
export function scoreReply(reply: string, keywords: string[]): string[] {
  const haystack = String(reply ?? "").toLowerCase();
  return keywords.filter((k) => {
    const needle = k.trim().toLowerCase();
    return needle !== "" && !haystack.includes(needle);
  });
}

export function resultFor(q: string, reply: string, keywords: string[]): HarnessResult {
  const missing = scoreReply(reply, keywords);
  return { q, missing, pass: missing.length === 0 };
}

export function aggregate(results: HarnessResult[]): {
  passed: number;
  total: number;
  allPassed: boolean;
} {
  const passed = results.filter((r) => r.pass).length;
  return { passed, total: results.length, allPassed: passed === results.length };
}
