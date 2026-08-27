"use client";

import { useState } from "react";
import ProfilePicker from "@/components/chat/profile-picker";
import FocusPicker from "@/components/chat/focus-picker";
import ChatConversation from "@/components/chat/chat-conversation";
import type { ProvidersFile } from "@/lib/core/types";

export default function ChatPage() {
  const [providers, setProviders] = useState<ProvidersFile | null>(null);
  const [profileId, setProfileId] = useState<string>("");
  const [focus, setFocus] = useState<{ type: "project" | "area"; slug: string } | null>(null);

  if (profileId === "" && providers) {
    const initial = providers.profiles.find((p) => p.id === providers.default)?.id ?? providers.profiles[0]?.id ?? "";
    if (initial) setProfileId(initial);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-end gap-4 border-b border-neutral-800 pb-3">
        <h1 className="text-2xl font-semibold text-neutral-100">Chat</h1>
        <ProfilePicker
          value={profileId}
          onChange={(id) => setProfileId(id)}
          onLoaded={setProviders}
        />
        <FocusPicker value={focus} onChange={setFocus} />
      </div>
      <div className="min-h-0 flex-1 pt-4">
        {profileId ? (
          <ChatConversation
            key={`${profileId}|${focus?.type ?? ""}|${focus?.slug ?? ""}`}
            profileId={profileId}
            focus={focus}
          />
        ) : (
          <p className="text-sm text-neutral-400">
            No provider profile configured. Add one in Settings to start chatting.
          </p>
        )}
      </div>
    </div>
  );
}
