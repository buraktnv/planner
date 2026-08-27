"use client";

import type { UIMessage } from "ai";
import ToolCard from "./tool-card";

export default function MessageList({ messages }: { messages: UIMessage[] }) {
  return (
    <div className="flex flex-col gap-5">
      {messages.map((m) => (
        <div key={m.id}>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
            {m.role === "user" ? "You" : "Assistant"}
          </div>
          <div className="space-y-2">
            {m.parts.map((part, i) => {
              if (part.type === "text") {
                return (
                  <div
                    key={i}
                    className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-100"
                  >
                    {part.text}
                  </div>
                );
              }
              if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
                return <ToolCard key={i} part={part as never} />;
              }
              return null;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
