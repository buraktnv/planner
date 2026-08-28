import { toolImplMap } from "./tool-map";
import type {
  ProposalAction,
  ProposalActionResult,
  ProposalApplyResult,
} from "./schemas";

export async function applyProposal(actions: ProposalAction[]): Promise<ProposalApplyResult> {
  const results: ProposalActionResult[] = [];
  let failedIndex: number | null = null;

  for (let i = 0; i < actions.length; i++) {
    const { kind, ...input } = actions[i];
    try {
      const result = await toolImplMap[kind](input as Record<string, unknown>);
      results.push({ kind, ok: true, result });
    } catch (err) {
      results.push({ kind, ok: false, error: err instanceof Error ? err.message : String(err) });
      failedIndex = i;
      break;
    }
  }

  return {
    applied: results.filter((r) => r.ok).length,
    failedIndex,
    results,
  };
}
