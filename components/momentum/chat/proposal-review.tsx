"use client";

import { useState } from "react";
import Link from "next/link";
import { LANES } from "@/lib/ui/momentum";
import { taskHrefFromScope } from "@/lib/view/task";
import {
  applyEdit,
  blockingRefs,
  draftStats,
  fieldsForKind,
  opaqueFieldsFor,
  setAllSelected,
  toggleRow,
  unresolvableRefs,
  validateDraft,
  type FieldDescriptor,
  type ReviewDraft,
  type ReviewRow,
} from "@/lib/view/proposal-review";
import Dialog from "../dialog";
import Markdown from "../markdown";
import { Mono } from "../primitives";

const INPUT =
  "w-full rounded-[8px] border border-edge bg-bg px-2.5 py-1.5 text-[12.5px] outline-none focus:border-ink";

export default function ProposalReview({
  draft,
  busy,
  revising,
  reviseNote,
  stale,
  error,
  onChange,
  onAccept,
  onRevise,
  onClose,
}: {
  draft: ReviewDraft;
  busy: boolean;
  /** A revision is in flight for this card; the modal stays open through it. */
  revising: boolean;
  /** Set when a revise turn came back with no new batch. */
  reviseNote?: string;
  /** Another card in this lineage has already been applied. */
  stale: boolean;
  error?: string;
  onChange: (next: ReviewDraft) => void;
  onAccept: () => void;
  /**
   * Absent on surfaces with no AI turn to revise with — the `/proposals` page
   * reads a filed proposal long after the conversation that produced it, so the
   * ASK FOR CHANGES box is hidden there rather than offering a button that
   * cannot do anything.
   */
  onRevise?: (instruction: string) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [ask, setAsk] = useState("");
  const stats = draftStats(draft);
  const validation = validateDraft(draft);
  const blocking = blockingRefs(draft);
  const unresolved = unresolvableRefs(draft);
  const canAccept =
    stats.selected > 0 && validation.ok && blocking.length === 0 && !busy && !revising && !stale;

  const send = () => {
    if (!onRevise || !ask.trim() || revising || busy || stats.selected === 0) return;
    onRevise(ask);
    setAsk("");
  };

  return (
    <Dialog label={`Review: ${draft.title}`} onClose={onClose} maxWidth={760} paddingTop={48}>
      <div className="mb-1 flex items-start gap-3">
        <h2 className="m-0 min-w-0 flex-1 text-[15px] font-semibold tracking-[-0.01em]">
          {draft.title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 font-mono text-[9px] tracking-[0.08em] text-faint transition-colors hover:text-ink"
        >
          CLOSE
        </button>
      </div>

      {draft.summary && (
        <Markdown className="mb-3 text-[12.5px] leading-[1.55] text-dim [&>p]:m-0" diagrams={false}>
          {draft.summary}
        </Markdown>
      )}

      <div className="mb-3 flex items-center gap-3">
        <Mono className="text-[8.5px] tracking-[0.1em] text-faint">
          {stats.total} CHANGE{stats.total === 1 ? "" : "S"}
          {stats.applied > 0 ? ` · ${stats.applied} ALREADY APPLIED` : ""}
          {stats.edited > 0 ? ` · ${stats.edited} EDITED BY YOU` : ""}
        </Mono>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => onChange(setAllSelected(draft, stats.selected === 0))}
          className="font-mono text-[8.5px] tracking-[0.08em] text-faint transition-colors hover:text-ink"
        >
          {stats.selected === 0 ? "SELECT ALL" : "CLEAR ALL"}
        </button>
      </div>

      <div className={`flex flex-col gap-1.5 ${revising ? "pointer-events-none opacity-45" : ""}`}>
        {draft.rows.map((row) => (
          <Row
            key={row.index}
            row={row}
            open={open[row.index] === true}
            issues={validation.rowIssues[row.index] ?? []}
            unresolved={unresolved.find((u) => u.index === row.index)?.label}
            onToggleOpen={() =>
              setOpen((prev) => ({ ...prev, [row.index]: prev[row.index] !== true }))
            }
            onToggleSelected={() => onChange(toggleRow(draft, row.index))}
            onEdit={(key, value) => onChange(applyEdit(draft, row.index, key, value))}
          />
        ))}
      </div>

      {blocking.length > 0 && (
        <div className="mt-3 rounded-[10px] border border-wait-ink/30 bg-wait-tint px-3 py-2.5">
          <Mono className="mb-1 block text-[8.5px] tracking-[0.1em] text-wait-ink">
            THIS WOULD FAIL PART-WAY
          </Mono>
          {blocking.map((b) => (
            <p key={b.index} className="m-0 text-[11.5px] leading-[1.5] text-dim">
              {b.label}
            </p>
          ))}
          <p className="mt-1.5 mb-0 text-[11.5px] leading-[1.5] text-faint">
            Earlier changes would already be written and committed. Untick that row, or fix the id.
          </p>
        </div>
      )}

      {error && (
        <p className="mt-3 mb-0 text-[11.5px] leading-[1.5] text-wait-ink">{error}</p>
      )}

      {stale && (
        <p className="mt-3 mb-0 text-[11.5px] leading-[1.5] text-wait-ink">
          A revised version of this batch has already been applied. Accepting this one would
          write everything a second time.
        </p>
      )}

      {onRevise && (
      <div className="mt-4 border-t border-edge2 pt-3.5">
        <Mono className="mb-[7px] block text-[8px] tracking-[0.12em] text-faint">
          ASK FOR CHANGES
        </Mono>
        <div className="flex items-center gap-2.5 rounded-[11px] border border-edge bg-bg px-3 py-2">
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={revising || busy}
            placeholder={
              revising ? "Rewriting the batch…" : "make the second one due Friday, drop the last"
            }
            className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-faint"
          />
          <button
            type="button"
            onClick={send}
            disabled={!ask.trim() || revising || busy || stats.selected === 0}
            className="shrink-0 font-mono text-[9px] tracking-[0.08em] text-faint transition-colors hover:text-ink disabled:opacity-40"
          >
            {revising ? "…" : "SEND"}
          </button>
        </div>
        <p className="mt-1.5 mb-0 text-[11px] leading-[1.45] text-faint">
          {stats.selected === draft.rows.length
            ? "Your edits go with it — it revises what you see now."
            : `Only the ${stats.selected} you kept go with it. Removed rows will not come back.`}
        </p>
        {reviseNote && (
          <p className="mt-1.5 mb-0 text-[11.5px] leading-[1.45] text-wait-ink">{reviseNote}</p>
        )}
      </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={!canAccept}
          className="rounded-[9px] bg-quick px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Applying…" : stats.label}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-[9px] border border-edge px-3 py-2 text-[12.5px] text-dim transition-colors hover:text-ink"
        >
          Cancel
        </button>
        {!validation.ok && (
          <Mono className="text-[8.5px] tracking-[0.08em] text-wait-ink">
            FIX THE HIGHLIGHTED FIELDS
          </Mono>
        )}
      </div>
    </Dialog>
  );
}

function Row({
  row,
  open,
  issues,
  unresolved,
  onToggleOpen,
  onToggleSelected,
  onEdit,
}: {
  row: ReviewRow;
  open: boolean;
  issues: { key: string | null; message: string }[];
  unresolved?: string;
  onToggleOpen: () => void;
  onToggleSelected: () => void;
  onEdit: (key: string, value: string | boolean) => void;
}) {
  const lane = row.preview?.lane ? LANES[row.preview.lane] : null;
  const landed = row.applied === "ok";
  const failed = row.applied === "failed";
  const action = row.action as Record<string, unknown>;
  const opaque = opaqueFieldsFor(row.action);

  return (
    <div
      className={`rounded-[11px] border px-2.5 py-2 ${
        failed ? "border-wait-ink/40" : "border-edge2"
      } ${landed ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-2.5">
        <input
          type="checkbox"
          checked={row.selected && !landed}
          disabled={landed}
          onChange={onToggleSelected}
          aria-label={`Include ${row.preview?.title ?? row.kind}`}
          className="h-[13px] w-[13px] shrink-0 accent-quick"
        />
        {row.preview?.scope ? (
          <Link href={taskHrefFromScope(row.preview.scope, row.preview.id)} className="shrink-0">
            <Mono className="text-[9px] text-faint hover:text-ink hover:underline">
              {row.preview.id}
            </Mono>
          </Link>
        ) : (
          <Mono className="shrink-0 text-[9px] text-faint">{row.preview?.id ?? "—"}</Mono>
        )}
        <button
          type="button"
          onClick={onToggleOpen}
          className="min-w-0 flex-1 text-left text-[12.5px] text-ink"
        >
          {row.preview?.title ?? row.kind}
        </button>
        {row.edited && (
          <Mono className="shrink-0 rounded-[5px] bg-soft px-1.5 py-[3px] text-[8px] tracking-[0.08em] text-dim">
            EDITED
          </Mono>
        )}
        {landed && (
          <Mono className="shrink-0 text-[8.5px] tracking-[0.08em] text-quick-ink">APPLIED</Mono>
        )}
        <Mono
          className="shrink-0 rounded-[5px] px-1.5 py-[3px] text-[8.5px] tracking-[0.08em]"
          style={
            lane
              ? { color: lane.ink, background: lane.tint }
              : { color: "var(--color-faint)", background: "var(--color-soft)" }
          }
        >
          {lane ? lane.label.toUpperCase() : row.preview?.note.toUpperCase() || "EVENT"}
        </Mono>
        <button
          type="button"
          onClick={onToggleOpen}
          aria-label={open ? "Collapse" : "Expand"}
          className="shrink-0 font-mono text-[10px] text-faint transition-colors hover:text-ink"
        >
          {open ? "▾" : "▸"}
        </button>
      </div>

      {!open && row.preview?.detail && (
        <p className="mt-1 mb-0 pl-[26px] text-[11.5px] leading-[1.45] text-faint">
          {row.preview.detail}
        </p>
      )}

      {unresolved && (
        <p className="mt-1.5 mb-0 pl-[26px] text-[11.5px] leading-[1.45] text-wait-ink">
          {unresolved}
        </p>
      )}

      {failed && row.error && (
        <p className="mt-1.5 mb-0 pl-[26px] text-[11.5px] leading-[1.45] text-wait-ink">
          Failed: {row.error}
        </p>
      )}

      {open && (
        <div className="mt-2.5 flex flex-col gap-2 pl-[26px]">
          {fieldsForKind(row.kind).map((field) => (
            <Field
              key={field.key}
              field={field}
              value={action[field.key]}
              issue={issues.find((i) => i.key === field.key)?.message}
              disabled={landed}
              onEdit={onEdit}
            />
          ))}
          {opaque.map((f) => (
            <div key={f.label} className="flex items-baseline gap-2">
              <Mono className="w-[88px] shrink-0 text-[8.5px] tracking-[0.08em] text-faint">
                {f.label.toUpperCase()}
              </Mono>
              <span className="min-w-0 flex-1 text-[12px] text-dim">{f.value}</span>
            </div>
          ))}
          {issues
            .filter((i) => !i.key || !fieldsForKind(row.kind).some((f) => f.key === i.key))
            .map((i, n) => (
              <p key={n} className="m-0 text-[11.5px] text-wait-ink">
                {i.message}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}

function Field({
  field,
  value,
  issue,
  disabled,
  onEdit,
}: {
  field: FieldDescriptor;
  value: unknown;
  issue?: string;
  disabled: boolean;
  onEdit: (key: string, value: string | boolean) => void;
}) {
  const text = value === undefined || value === null ? "" : String(value);

  return (
    <div className="flex items-start gap-2">
      <Mono className="w-[88px] shrink-0 pt-2 text-[8.5px] tracking-[0.08em] text-faint">
        {field.label.toUpperCase()}
      </Mono>
      <div className="min-w-0 flex-1">
        {field.type === "boolean" ? (
          <input
            type="checkbox"
            checked={value === true}
            disabled={disabled}
            onChange={(e) => onEdit(field.key, e.target.checked)}
            className="mt-2 h-[13px] w-[13px] accent-quick"
          />
        ) : field.type === "select" ? (
          <select
            value={text}
            disabled={disabled}
            onChange={(e) => onEdit(field.key, e.target.value)}
            className={INPUT}
          >
            {!field.required && <option value="">—</option>}
            {field.options?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : field.type === "textarea" ? (
          <textarea
            value={text}
            rows={3}
            disabled={disabled}
            placeholder={field.placeholder}
            onChange={(e) => onEdit(field.key, e.target.value)}
            className={`${INPUT} resize-y leading-[1.5]`}
          />
        ) : (
          <input
            type="text"
            value={text}
            disabled={disabled}
            placeholder={field.placeholder}
            onChange={(e) => onEdit(field.key, e.target.value)}
            className={`${INPUT} ${issue ? "border-wait-ink" : ""}`}
          />
        )}
        {issue && <p className="mt-1 mb-0 text-[11px] text-wait-ink">{issue}</p>}
      </div>
    </div>
  );
}
