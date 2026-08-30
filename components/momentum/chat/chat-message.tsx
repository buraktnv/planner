"use client";

import type { UIMessage } from "ai";
import type { ReactNode } from "react";
import {
  partsOf,
  toolNameOf,
  toolStatus,
  toolSummary,
  type ToolPartLike,
} from "@/lib/view/chat-parts";
import Markdown from "../markdown";

const STATUS_MARK = { pending: "…", done: "✓", error: "✕" } as const;
const STATUS_INK = {
  pending: "text-faint",
  done: "text-quick-ink",
  error: "text-wait-ink",
} as const;

export default function ChatMessage({
  message,
  streaming,
  openReasoning,
  onToggleReasoning,
  renderTool,
}: {
  message: UIMessage;
  /** A half-arrived mermaid fence would re-parse and fail on every delta. */
  streaming: boolean;
  openReasoning: Record<string, boolean>;
  onToggleReasoning: (key: string) => void;
  /** The rail owns proposal state, so it decides what a tool part renders as. */
  renderTool: (part: ToolPartLike, key: string) => ReactNode;
}) {
  const { text, thoughts, tools } = partsOf(message);

  if (message.role === "user") {
    return (
      <div className="animate-slidein max-w-[85%] self-end">
        <div className="rounded-[14px_14px_4px_14px] bg-soft px-[13px] py-2.5 text-[13.5px] leading-[1.5] whitespace-pre-wrap">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-slidein self-stretch">
      {thoughts.length > 0 && (
        <div className="mb-2.5 flex flex-col gap-1.5">
          {thoughts.map((t, i) => {
            const key = `${message.id}-r${i}`;
            const shown = openReasoning[key] === true;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onToggleReasoning(key)}
                className="rounded-[9px] border border-edge2 bg-soft px-2.5 py-1.5 text-left font-mono text-[10px] leading-[1.5] text-dim transition-colors hover:text-ink"
              >
                <span className="text-faint">{shown ? "▾" : "▸"} THOUGHT </span>
                {shown ? (
                  <span className="whitespace-pre-wrap">{t}</span>
                ) : (
                  <span>{t.replace(/\s+/g, " ").slice(0, 64)}…</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {tools.length > 0 && (
        <div className="mb-2.5 flex flex-col items-start gap-1.5">
          {tools.map((t, i) => {
            const status = toolStatus(t);
            return (
              <div
                key={t.toolCallId ?? `${message.id}-t${i}`}
                className="inline-flex items-center gap-2 rounded-[9px] border border-edge2 bg-soft px-2.5 py-1.5 font-mono text-[10px] text-dim"
              >
                <span className={STATUS_INK[status]}>{STATUS_MARK[status]}</span>
                {toolNameOf(t)}
                <span className="text-faint">{toolSummary(t)}</span>
              </div>
            );
          })}
        </div>
      )}

      {text && (
        <Markdown className="text-[13.5px] leading-[1.6] text-ink" diagrams={!streaming}>
          {text}
        </Markdown>
      )}

      {tools.map((t, i) => renderTool(t, t.toolCallId ?? `${message.id}-${i}`))}
    </div>
  );
}
