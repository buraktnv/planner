"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import MessageList from "./message-list";
import Composer from "./composer";

interface Focus {
  type: "project" | "area";
  slug: string;
}

export default function ChatConversation({
  profileId,
  focus,
}: {
  profileId: string;
  focus: Focus | null;
}) {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { profileId, focus: focus ?? undefined },
    }),
  });

  const busy = status === "streaming" || status === "submitted";

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Ask about your projects, areas, or journal — or have the assistant create and update tasks.
          </p>
        ) : (
          <MessageList messages={messages} />
        )}
      </div>
      <Composer onSubmit={(text) => sendMessage({ text })} disabled={busy} />
    </div>
  );
}
