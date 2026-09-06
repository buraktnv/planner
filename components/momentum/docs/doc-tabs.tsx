"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Markdown from "../markdown";
import { Mono } from "../primitives";
import DocToc from "./doc-toc";
import ComparePanel from "./compare-panel";
import type { TocEntry } from "@/lib/view/doc";
import type { AiStatus } from "@/lib/core/note-sections";

type Tab = "note" | "ai";

/**
 * Two readings of one note. The NOTE tab is the body written for a person;
 * FOR THE AI is the summary line the assistant always sees plus the section
 * written for it, which is what an `@` mention in chat injects. Local state,
 * no route and no storage: which tab is open is not worth remembering.
 *
 * `aiStatus` says whether the body moved after the section was last confirmed
 * against it. MARK CHECKED re-hashes without a change; REVISE LATER files a
 * small task on the note's first charter, linked through `note:`, so the fix
 * has somewhere to wait.
 */
export default function DocTabs({
  noteId,
  summary,
  body,
  forAi,
  aiStatus,
  scope,
  toc,
}: {
  noteId: string;
  summary: string;
  body: string;
  forAi: string | null;
  aiStatus: AiStatus;
  scope: string[];
  toc: TocEntry[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(aiStatus === "unchecked" ? "ai" : "note");
  const [busy, setBusy] = useState<"check" | "revise" | null>(null);
  const [created, setCreated] = useState<{ id: string; href: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const first = scope[0];
  const charter = first
    ? first.startsWith("area:")
      ? { base: "areas", slug: first.slice("area:".length) }
      : { base: "projects", slug: first }
    : null;

  const markChecked = async () => {
    setBusy("check");
    setError(null);
    try {
      const res = await fetch(`/api/knowledge/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmAi: true }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setError("Could not mark it checked.");
    } finally {
      setBusy(null);
    }
  };

  const reviseLater = async () => {
    if (!charter) return;
    setBusy("revise");
    setError(null);
    try {
      const res = await fetch(`/api/${charter.base}/${charter.slug}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Revise ${noteId}: body and For the AI section`,
          size: "S",
          note: noteId,
          description: `The body of ${noteId} moved after its For the AI section was last checked. Run COMPARE on the note page first, then bring the body and the section in line and mark it checked.`,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? String(res.status));
      setCreated({ id: data.id, href: `/${charter.base}/${charter.slug}/tasks/${data.id}` });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the task.");
    } finally {
      setBusy(null);
    }
  };

  const tabClass = (on: boolean) =>
    `rounded-[8px] px-[10px] py-[5px] font-mono text-[9px] tracking-[0.14em] transition-colors ${
      on ? "bg-ink text-bg" : "text-faint hover:text-ink"
    }`;

  const tabLabel =
    aiStatus === "unchecked" ? "FOR THE AI · UNCHECKED" : forAi ? "FOR THE AI" : "FOR THE AI · EMPTY";

  return (
    <div className="mt-5">
      <div className="mb-4 flex items-center gap-1.5">
        <button type="button" onClick={() => setTab("note")} className={tabClass(tab === "note")}>
          NOTE
        </button>
        <button type="button" onClick={() => setTab("ai")} className={tabClass(tab === "ai")}>
          {tabLabel}
        </button>
      </div>

      {tab === "note" ? (
        <>
          <DocToc toc={toc} />
          {body.trim() ? (
            <Markdown className="text-[14px] leading-[1.7] text-ink">{body}</Markdown>
          ) : (
            <p className="text-[13px] text-faint">
              No body yet — the summary is all there is. Use Edit to write it up.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="rounded-[12px] border border-edge bg-soft px-[14px] py-[11px]">
            <Mono className="mb-1.5 block text-[8px] tracking-[0.14em] text-faint">
              SUMMARY — LOADED INTO EVERY CHAT IN THIS SCOPE
            </Mono>
            <div className="text-[13.5px] leading-[1.5] text-ink">{summary}</div>
          </div>

          {aiStatus === "unchecked" ? (
            <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-[12px] border border-wait-ink/40 bg-wait-tint px-[14px] py-[10px]">
              <span className="min-w-0 flex-1 text-[12.5px] leading-[1.5] text-wait-ink">
                The body changed after this section was last checked against it. Read both, or
                run COMPARE below, then mark it checked — or leave a task to do it later.
              </span>
              <button
                type="button"
                onClick={markChecked}
                disabled={busy !== null}
                className="shrink-0 rounded-[10px] border border-edge bg-surf px-[12px] py-[6px] text-[12px] font-medium transition-colors hover:border-ink disabled:opacity-45"
              >
                {busy === "check" ? "Marking…" : "Mark checked"}
              </button>
              <button
                type="button"
                onClick={reviseLater}
                disabled={busy !== null || !charter || created !== null}
                title={charter ? undefined : "File the note under a project or area first"}
                className="shrink-0 rounded-[10px] border border-edge bg-surf px-[12px] py-[6px] text-[12px] font-medium transition-colors hover:border-ink disabled:opacity-45"
              >
                {busy === "revise" ? "Creating…" : "Revise later"}
              </button>
            </div>
          ) : null}
          {created ? (
            <Mono className="mt-2 block text-[9px] tracking-[0.1em] text-faint">
              FILED AS{" "}
              <Link href={created.href} className="underline">
                {created.id}
              </Link>
            </Mono>
          ) : null}
          {error ? <div className="mt-2 text-[12.5px] text-wait-ink">{error}</div> : null}

          <div className="mt-4">
            <Mono className="mb-2 block text-[8px] tracking-[0.14em] text-faint">
              FOR THE AI — READ ON @MENTION AND read_note
              {aiStatus === "fresh" ? " · CHECKED AGAINST THIS BODY" : ""}
            </Mono>
            {forAi ? (
              <Markdown className="text-[14px] leading-[1.7] text-ink">{forAi}</Markdown>
            ) : (
              <p className="m-0 text-[13px] leading-[1.6] text-faint">
                Nothing written for the AI yet. It reads the summary and then the note. Use Edit to
                give it a terse version: facts, constraints, what to do with them.
              </p>
            )}
          </div>
          <ComparePanel noteId={noteId} />
        </>
      )}
    </div>
  );
}
