"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CHAT_MODES, CHAT_MODE_KEYS, type ChatMode } from "@/lib/ai/modes";
import { toolNames, type Proposal } from "@/lib/ai/schemas";
import type { ProviderEffort, ProviderProfile, ProvidersFile } from "@/lib/core/types";
import { isProviderEffort, nextEffort } from "@/lib/ui/providers";
import { asProposal, toolNameOf, type ToolPartLike } from "@/lib/view/chat-parts";
import type { NavCharter } from "./context";
import ChatMessage from "./chat/chat-message";
import { Mono } from "./primitives";
import ProposalCard, { type ProposalState } from "./proposal-card";

const PROFILE_KEY = "planner.chat.profile";
const EFFORT_KEY = "planner.chat.effort";

function remember(key: string, value: string | null) {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    void key;
  }
}

interface Session {
  id: string;
  title: string;
  mode: ChatMode | null;
  messages: UIMessage[];
}

function newSession(mode: ChatMode | null): Session {
  return {
    id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: mode ? `${CHAT_MODES[mode].label} — new` : "New conversation",
    mode,
    messages: [],
  };
}

function titleFrom(messages: UIMessage[], fallback: string): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return fallback;
  const text = first.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim();
  if (!text) return fallback;
  return text.length > 42 ? `${text.slice(0, 42)}…` : text;
}

function scopeFromPath(pathname: string): string | null {
  const project = /^\/projects\/([^/]+)/.exec(pathname);
  if (project) return `project/${decodeURIComponent(project[1])}`;
  const area = /^\/areas\/([^/]+)/.exec(pathname);
  if (area) return `area/${decodeURIComponent(area[1])}`;
  return null;
}

export default function ChatRail({
  open,
  overlay = false,
  onToggle,
  charters,
  scope,
  onScopeChange,
}: {
  open: boolean;
  overlay?: boolean;
  onToggle: () => void;
  charters: NavCharter[];
  scope: string | null;
  onScopeChange: (key: string | null) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mode, setMode] = useState<ChatMode | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [providers, setProviders] = useState<ProvidersFile | null>(null);
  const [profileId, setProfileId] = useState("");
  const [effort, setEffort] = useState<ProviderEffort | undefined>(undefined);
  const [openReasoning, setOpenReasoning] = useState<Record<string, boolean>>({});
  const [about, setAbout] = useState("");
  const [aboutState, setAboutState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [initialSession] = useState(() => newSession(null));
  const [sessions, setSessions] = useState<Session[]>(() => [initialSession]);
  const [activeId, setActiveId] = useState<string>(initialSession.id);
  const [proposalStates, setProposalStates] = useState<Record<string, ProposalState>>({});
  const transcripts = useRef<Map<string, UIMessage[]>>(new Map());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const effectiveScope = scope ?? scopeFromPath(pathname);
  const focus = useMemo(() => {
    if (!effectiveScope || effectiveScope === "all") return undefined;
    const [type, slug] = effectiveScope.split("/");
    if (type !== "project" && type !== "area") return undefined;
    return { type: type as "project" | "area", slug };
  }, [effectiveScope]);

  const scopeMeta = useMemo(() => {
    if (!effectiveScope || effectiveScope === "all") {
      return { label: "Everything, summarised", color: "#a9a3b5", tint: "var(--color-soft)" };
    }
    const match = charters.find((c) => c.key === effectiveScope);
    if (!match) return { label: "Everything, summarised", color: "#a9a3b5", tint: "var(--color-soft)" };
    return { label: match.name, color: match.color, tint: `${match.color}22` };
  }, [effectiveScope, charters]);

  const { messages, sendMessage, setMessages, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { profileId, focus, mode: mode ?? undefined, effort },
    }),
  });

  useEffect(() => {
    let alive = true;
    fetch("/api/providers")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ProvidersFile | null) => {
        if (!alive || !data) return;
        setProviders(data);
        let stored: string | null = null;
        let storedEffort: string | null = null;
        try {
          stored = window.localStorage.getItem(PROFILE_KEY);
          storedEffort = window.localStorage.getItem(EFFORT_KEY);
        } catch {
          stored = null;
        }
        const initial =
          (stored && data.profiles.find((p) => p.id === stored)?.id) ??
          data.profiles.find((p) => p.id === data.default)?.id ??
          data.profiles[0]?.id ??
          "";
        setProfileId(initial);
        const profile = data.profiles.find((p) => p.id === initial);
        setEffort(
          isProviderEffort(storedEffort) ? storedEffort : profile?.effort,
        );
      })
      .catch(() => {});
    fetch("/api/about")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { about?: string } | null) => {
        if (alive && data && typeof data.about === "string") setAbout(data.about);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, status]);

  const busy = status === "streaming" || status === "submitted";
  const active = sessions.find((s) => s.id === activeId) ?? sessions[0];
  const visibleSessions = mode
    ? sessions.filter((s) => s.mode === mode || s.id === activeId)
    : sessions;
  const activeTitle = titleFrom(messages, active?.title ?? "New conversation");

  const stash = () => {
    transcripts.current.set(activeId, messages);
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeId ? { ...s, messages, title: titleFrom(messages, s.title) } : s,
      ),
    );
  };

  const startSession = () => {
    stash();
    const s = newSession(mode);
    transcripts.current.set(s.id, []);
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
    setMessages([]);
    setSessionsOpen(false);
  };

  const pickSession = (id: string) => {
    if (id === activeId) {
      setSessionsOpen(false);
      return;
    }
    stash();
    setActiveId(id);
    setMessages(transcripts.current.get(id) ?? []);
    setSessionsOpen(false);
  };

  const pickProfile = (p: ProviderProfile) => {
    setProfileId(p.id);
    setEffort(p.effort);
    remember(PROFILE_KEY, p.id);
    remember(EFFORT_KEY, p.effort ?? null);
  };

  const cycleEffort = (p: ProviderProfile) => {
    const current = p.id === profileId ? (effort ?? p.effort) : p.effort;
    const next = nextEffort(p.type, current);
    if (p.id !== profileId) {
      setProfileId(p.id);
      remember(PROFILE_KEY, p.id);
    }
    setEffort(next);
    remember(EFFORT_KEY, next);
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || busy || !profileId) return;
    setDraft("");
    sendMessage({ text });
  };

  const setProposalState = (key: string, next: ProposalState) => {
    setProposalStates((prev) => ({ ...prev, [key]: next }));
  };

  const acceptProposal = async (key: string, proposal: Proposal) => {
    setProposalState(key, { status: "applying" });
    try {
      const res = await fetch("/api/proposals/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actions: proposal.actions }),
      });
      const data = (await res.json()) as {
        applied?: number;
        failedIndex?: number | null;
        results?: { error?: string }[];
        error?: string;
      };
      if (!res.ok) {
        setProposalState(key, { status: "error", error: data.error ?? "Could not apply" });
        return;
      }
      if (data.failedIndex != null) {
        const failure = data.results?.[data.failedIndex]?.error ?? "Action failed";
        setProposalState(key, {
          status: "error",
          error: `Applied ${data.applied ?? 0}, stopped at action ${data.failedIndex + 1}: ${failure}`,
        });
        router.refresh();
        return;
      }
      setProposalState(key, {
        status: "applied",
        applied: data.applied ?? proposal.actions.length,
      });
      router.refresh();
    } catch (e) {
      setProposalState(key, {
        status: "error",
        error: e instanceof Error ? e.message : "Could not apply",
      });
    }
  };

  /**
   * The transcript renders tool parts; the rail owns what they turn into. Today
   * that is the proposal card and nothing else — every other tool keeps its chip.
   */
  const renderTool = (part: ToolPartLike, key: string) => {
    if (toolNameOf(part) !== "propose_changes") return null;
    const proposal = asProposal(part.output);
    if (!proposal) return null;
    return (
      <ProposalCard
        key={key}
        proposal={proposal}
        state={proposalStates[key] ?? { status: "idle" }}
        onAccept={() => acceptProposal(key, proposal)}
        onDiscard={() => setProposalState(key, { status: "discarded" })}
      />
    );
  };

  const saveAbout = async () => {
    setAboutState("saving");
    try {
      const res = await fetch("/api/about", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ about }),
      });
      setAboutState(res.ok ? "saved" : "error");
    } catch {
      setAboutState("error");
    }
  };

  const strip = (
      <aside className="flex w-14 shrink-0 flex-col items-center gap-3.5 border-l border-edge2 bg-surf py-4.5">
        <button
          type="button"
          onClick={onToggle}
          className="grid h-[34px] w-[34px] place-items-center rounded-[11px] bg-quick-tint font-mono text-[12px] font-medium text-quick-ink"
          aria-label="Open assistant"
        >
          M
        </button>
        <span
          className="h-[7px] w-[7px] rounded-full"
          style={{ background: scopeMeta.color }}
        />
      </aside>
  );

  if (!open) return strip;

  const modeMeta = mode ? CHAT_MODES[mode] : null;

  const panel = (
    <aside
      className={
        overlay
          ? "fixed inset-y-0 right-0 z-40 flex w-[372px] max-w-[92vw] flex-col border-l border-edge2 bg-surf shadow-[0_0_40px_rgba(46,42,38,.18)]"
          : "flex w-[372px] min-w-[340px] shrink-0 flex-col border-l border-edge2 bg-surf"
      }
    >
      <div className="border-b border-edge2 px-[18px] pt-4 pb-3.5">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="grid h-[22px] w-[22px] place-items-center rounded-[7px] bg-quick-tint font-mono text-[10px] text-quick-ink">
            M
          </span>
          <span className="text-[13.5px] font-semibold">Assistant</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onToggle}
            className="text-base leading-none text-faint transition-colors hover:text-ink"
            aria-label="Collapse assistant"
          >
            ›
          </button>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setScopeOpen((v) => !v);
              setSessionsOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-[10px] px-[11px] py-2 text-left"
            style={{ background: scopeMeta.tint }}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-[3px]"
              style={{ background: scopeMeta.color }}
            />
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
              {scopeMeta.label}
            </span>
            {scope === null && (
              <Mono className="text-[8px] tracking-[0.08em] text-faint">AUTO</Mono>
            )}
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-faint)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {scopeOpen && (
            <div className="animate-pop absolute inset-x-0 top-full z-30 mt-1.5 max-h-[300px] overflow-y-auto rounded-[14px] border border-edge bg-surf p-2 shadow-[0_14px_34px_rgba(46,42,38,.14)]">
              {[
                {
                  label: "",
                  items: [
                    { label: "Follows the screen", value: null as string | null, dot: "var(--color-faint)" },
                    { label: "General", value: "all", dot: "#a9a3b5" },
                  ],
                },
                {
                  label: "LIFE",
                  items: charters
                    .filter((c) => c.type === "area")
                    .map((c) => ({ label: c.name, value: c.key, dot: c.color })),
                },
                {
                  label: "PROJECTS",
                  items: charters
                    .filter((c) => c.type === "project")
                    .map((c) => ({ label: c.name, value: c.key, dot: c.color })),
                },
              ]
                .filter((g) => g.items.length)
                .map((group) => (
                  <div key={group.label || "root"} className="mb-1">
                    {group.label && (
                      <Mono className="block px-2.5 pt-2 pb-[5px] text-[8px] tracking-[0.14em] text-faint">
                        {group.label}
                      </Mono>
                    )}
                    {group.items.map((item) => {
                      const selected = scope === item.value;
                      return (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => {
                            onScopeChange(item.value);
                            setScopeOpen(false);
                          }}
                          className={`flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left transition-colors hover:bg-soft ${
                            selected ? "bg-soft" : ""
                          }`}
                        >
                          <span
                            className="h-[7px] w-[7px] shrink-0 rounded-[2px]"
                            style={{ background: item.dot }}
                          />
                          <span
                            className={`text-[12.5px] ${selected ? "text-ink" : "text-dim"}`}
                          >
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="mt-2.5 flex gap-[5px]">
          {CHAT_MODE_KEYS.map((key) => {
            const m = CHAT_MODES[key];
            const on = mode === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setMode(on ? null : key)}
                className="flex-1 rounded-[9px] px-1 py-[7px] text-[11.5px] font-medium"
                style={{
                  color: on ? "#ffffff" : m.ink,
                  background: on ? m.color : m.tint,
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setSessionsOpen((v) => !v)}
          className="mt-2 flex w-full items-center gap-2 rounded-[10px] px-[9px] py-[7px] text-left transition-colors hover:bg-soft"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-faint)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
            aria-hidden
          >
            <path d="M4 6h16M4 12h16M4 18h10" />
          </svg>
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
            {activeTitle}
          </span>
          <Mono className="text-[9.5px] text-faint">{visibleSessions.length}</Mono>
        </button>
      </div>

      {sessionsOpen && (
        <div className="animate-pop border-b border-edge2 bg-bg p-2.5">
          <div className="flex flex-col gap-[3px]">
            {visibleSessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pickSession(s.id)}
                className={`rounded-[10px] px-[11px] py-[9px] text-left transition-colors hover:bg-soft ${
                  s.id === activeId ? "bg-soft" : ""
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className={`min-w-0 flex-1 truncate text-[12.5px] ${
                      s.id === activeId ? "text-ink" : "text-dim"
                    }`}
                  >
                    {s.title}
                  </span>
                  <Mono className="shrink-0 text-[9px] text-faint">
                    {(s.id === activeId ? messages : s.messages).length} msg
                  </Mono>
                </div>
                {s.mode && (
                  <Mono
                    className="mt-[7px] inline-block rounded-[4px] px-1.5 py-0.5 text-[8px] tracking-[0.08em]"
                    style={{ color: CHAT_MODES[s.mode].ink, background: CHAT_MODES[s.mode].tint }}
                  >
                    {CHAT_MODES[s.mode].label.toUpperCase()}
                  </Mono>
                )}
              </button>
            ))}
            <div className="mt-1.5 border-t border-edge2 pt-2">
              <button
                type="button"
                onClick={startSession}
                className="w-full rounded-[9px] border border-edge bg-surf py-[9px] text-[12px] text-dim transition-colors hover:border-ink hover:text-ink"
              >
                New session
              </button>
              <Mono className="mt-[7px] block text-center text-[8px] tracking-[0.06em] text-faint">
                CONVERSATIONS LIVE IN THIS BROWSER SESSION
              </Mono>
            </div>
          </div>
        </div>
      )}

      <div
        className="border-b border-edge2 px-4 py-2.5"
        style={{ borderLeft: `2px solid ${modeMeta ? modeMeta.color : "var(--color-edge)"}` }}
      >
        <span className="text-[11.5px] leading-[1.45] text-dim">
          {modeMeta ? modeMeta.opener : "Ask about anything on screen — it reads your real data."}
        </span>
      </div>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-[18px]">
        {messages.length === 0 && (
          <p className="m-0 text-[13px] leading-[1.6] text-faint">
            {profileId
              ? "Nothing yet. Ask what to do next, or have it create and tick tasks for you."
              : "No provider profile configured. Add one in Settings to start chatting."}
          </p>
        )}
        {messages.map((m, mi) => (
          <ChatMessage
            key={m.id}
            message={m}
            streaming={busy && mi === messages.length - 1}
            openReasoning={openReasoning}
            onToggleReasoning={(key) =>
              setOpenReasoning((prev) => ({ ...prev, [key]: prev[key] !== true }))
            }
            renderTool={renderTool}
          />
        ))}
        {busy && <Mono className="text-[9.5px] text-faint">THINKING…</Mono>}
      </div>

      {promptOpen && (
        <div className="animate-slidein max-h-[320px] overflow-y-auto border-t border-edge2 bg-bg px-4 py-3.5">
          <div className="mb-3.5 flex items-center gap-2.5">
            <Mono className="text-[8.5px] tracking-[0.14em] text-faint">
              WHAT IT IS WORKING FROM
            </Mono>
            <div className="flex-1" />
            <Mono className="text-[8.5px] text-faint">
              {providers ? `${providers.profiles.length} PROFILES` : "—"}
            </Mono>
          </div>

          <div
            className="mb-3.5 pl-[11px]"
            style={{ borderLeft: `2px solid ${modeMeta ? modeMeta.color : "var(--color-edge)"}` }}
          >
            <Mono className="mb-1.5 block text-[8px] tracking-[0.12em] text-faint">MODE</Mono>
            <div className="text-[12px] leading-[1.5] text-ink">
              {modeMeta
                ? `${modeMeta.label} — ${modeMeta.instruction}`
                : "No mode — default assistant behaviour."}
            </div>
          </div>

          <div
            className="mb-3.5 pl-[11px]"
            style={{ borderLeft: `2px solid ${scopeMeta.color}` }}
          >
            <Mono className="mb-1.5 block text-[8px] tracking-[0.12em] text-faint">SCOPE</Mono>
            <div className="text-[12px] leading-[1.5] text-ink">
              {focus
                ? `${scopeMeta.label} — charter, open tasks, targets, last 7 days of journal`
                : "Everything, summarised — no charter is focused"}
            </div>
          </div>

          {providers && providers.profiles.length > 0 && (
            <div className="mb-3.5">
              <Mono className="mb-[7px] block text-[8px] tracking-[0.12em] text-faint">
                PROVIDER
              </Mono>
              <div className="flex max-h-[190px] flex-col gap-[3px] overflow-y-auto">
                {providers.profiles.map((p) => {
                  const selected = p.id === profileId;
                  const shown = selected ? (effort ?? p.effort) : p.effort;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-2 rounded-[10px] px-2.5 py-[7px] transition-colors ${
                        selected ? "bg-soft" : "hover:bg-soft"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => pickProfile(p)}
                        className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
                      >
                        <span
                          className={`min-w-0 truncate text-[12px] ${
                            selected ? "text-ink" : "text-dim"
                          }`}
                        >
                          {p.label}
                        </span>
                        <Mono className="shrink-0 text-[8.5px] text-faint">{p.model}</Mono>
                      </button>
                      <button
                        type="button"
                        onClick={() => cycleEffort(p)}
                        title="Cycle reasoning effort"
                        className="shrink-0 rounded-[5px] px-[7px] py-[3px] font-mono text-[8.5px] tracking-[0.08em] transition-colors"
                        style={{
                          color: shown ? "var(--color-deep-ink)" : "var(--color-faint)",
                          background: shown ? "var(--color-deep-tint)" : "var(--color-soft)",
                        }}
                      >
                        {(shown ?? "auto").toUpperCase()}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mb-3.5">
            <Mono className="mb-[7px] block text-[8px] tracking-[0.12em] text-faint">
              GENERAL CONTEXT — ALWAYS SENT, YOURS TO EDIT (about.md)
            </Mono>
            <textarea
              value={about}
              onChange={(e) => {
                setAbout(e.target.value);
                setAboutState("idle");
              }}
              rows={5}
              className="w-full resize-y rounded-[11px] border border-edge bg-surf px-3 py-2.5 text-[11.5px] leading-[1.6] outline-none"
            />
            <div className="mt-2 flex items-center gap-2.5">
              <button
                type="button"
                onClick={saveAbout}
                className="rounded-[9px] border border-edge bg-surf px-3 py-1.5 text-[11.5px] text-dim transition-colors hover:border-ink hover:text-ink"
              >
                Save context
              </button>
              <Mono className="text-[8.5px] tracking-[0.08em] text-faint">
                {aboutState === "saving"
                  ? "SAVING…"
                  : aboutState === "saved"
                    ? "SAVED TO about.md"
                    : aboutState === "error"
                      ? "COULD NOT SAVE"
                      : ""}
              </Mono>
            </div>
          </div>

          <div>
            <Mono className="mb-[7px] block text-[8px] tracking-[0.12em] text-faint">
              TOOLS IT MAY CALL
            </Mono>
            <div className="flex flex-wrap gap-[5px]">
              {toolNames.map((t) => (
                <Mono key={t} className="rounded-md bg-soft px-2 py-1 text-[9px] text-dim">
                  {t}
                </Mono>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-edge2 px-[18px] pt-3.5 pb-4">
        <div className="flex items-center gap-2.5 rounded-[13px] border border-edge bg-bg px-[13px] py-2.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={
              focus ? `Ask about ${scopeMeta.label}…` : "Ask anything…"
            }
            className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-faint"
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy || !draft.trim()}
            className="font-mono text-[9.5px] text-faint transition-colors hover:text-ink disabled:opacity-50"
          >
            ⌘⏎
          </button>
        </div>
        <button
          type="button"
          onClick={() => setPromptOpen((v) => !v)}
          className="mt-2.5 flex items-center gap-[7px] text-faint transition-colors hover:text-ink"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v.5M12 11v5" />
          </svg>
          <Mono className="text-[8.5px] tracking-[0.1em]">INSPECT CONTEXT</Mono>
        </button>
      </div>
    </aside>
  );

  if (overlay) {
    return (
      <>
        {strip}
        {panel}
      </>
    );
  }

  return panel;
}
