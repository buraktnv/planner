import { listProposals } from "@/lib/core/proposals";
import { buildProposal } from "@/lib/ai/tools";
import { groupProposals, toRow } from "@/lib/view/proposals";
import type { Proposal } from "@/lib/ai/schemas";
import { AssistantNote, PageTitle } from "@/components/momentum/primitives";
import ProposalsView, { type ProposalEntry } from "./proposals-view";

export const dynamic = "force-dynamic";

/**
 * The inbox for proposals an agent filed but nobody has accepted yet.
 *
 * Deliberately absent from every nav: reachable at `/proposals` and from the
 * chat rail's chip, the same way `/archive/<type>/<name>` is link-only.
 */
export default async function ProposalsPage() {
  const stored = await listProposals();
  const rows = stored.map(toRow);

  /**
   * Previews are rebuilt here rather than read from the file, and that is the
   * whole reason this page is safe.
   *
   * `previewRow` resolves a referenced task only if it exists *at the moment the
   * proposal is built*, and `unresolvableRefs` gates Accept on exactly that. A
   * preview frozen at propose time would keep saying "fine" for a task deleted
   * since, and the failure would land mid-batch after earlier rows had already
   * been committed — the precise failure the check exists to prevent. It would
   * also describe titles and lanes that have since changed.
   */
  const entries: ProposalEntry[] = [];
  for (const row of rows) {
    let proposal: Proposal | null = null;
    if (!row.empty) {
      try {
        const fresh = await buildProposal({
          title: row.title,
          summary: row.summary,
          actions: row.actions,
        });
        proposal = { ...fresh, proposalId: row.id };
      } catch {
        // A charter referenced by the batch may have gone; show the row without
        // an openable card rather than failing the whole page.
        proposal = null;
      }
    }
    entries.push({ row, proposal });
  }

  const groups = groupProposals(rows);

  return (
    <div className="mx-auto w-full max-w-[900px] px-7 py-8">
      <PageTitle
        title="Proposals"
        meta={groups.open.length ? `${groups.open.length} WAITING` : undefined}
      />
      <AssistantNote>
        Batches an assistant proposed but nobody accepted yet. Open one to read every row in
        full, change what it says, drop what you do not want, then apply the rest. Nothing here
        has been written to your data.
      </AssistantNote>
      <ProposalsView entries={entries} />
    </div>
  );
}
