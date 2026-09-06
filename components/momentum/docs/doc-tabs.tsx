"use client";

import { useState } from "react";
import Markdown from "../markdown";
import { Mono } from "../primitives";
import DocToc from "./doc-toc";
import ComparePanel from "./compare-panel";
import type { TocEntry } from "@/lib/view/doc";

type Tab = "note" | "ai";

/**
 * Two readings of one note. The NOTE tab is the body written for a person;
 * FOR THE AI is the summary line the assistant always sees plus the section
 * written for it, which is what an `@` mention in chat injects. Local state,
 * no route and no storage: which tab is open is not worth remembering.
 */
export default function DocTabs({
  noteId,
  summary,
  body,
  forAi,
  toc,
}: {
  noteId: string;
  summary: string;
  body: string;
  forAi: string | null;
  toc: TocEntry[];
}) {
  const [tab, setTab] = useState<Tab>("note");

  const tabClass = (on: boolean) =>
    `rounded-[8px] px-[10px] py-[5px] font-mono text-[9px] tracking-[0.14em] transition-colors ${
      on ? "bg-ink text-bg" : "text-faint hover:text-ink"
    }`;

  return (
    <div className="mt-5">
      <div className="mb-4 flex items-center gap-1.5">
        <button type="button" onClick={() => setTab("note")} className={tabClass(tab === "note")}>
          NOTE
        </button>
        <button type="button" onClick={() => setTab("ai")} className={tabClass(tab === "ai")}>
          FOR THE AI{forAi ? "" : " · EMPTY"}
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
          <div className="mt-4">
            <Mono className="mb-2 block text-[8px] tracking-[0.14em] text-faint">
              FOR THE AI — READ ON @MENTION AND read_note
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
