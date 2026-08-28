import { apiKeyEnvOf, getProviders, PROVIDER_PRESETS } from "@/lib/core/providers";
import { toolNames, toolDescriptions } from "@/lib/ai/schemas";
import { Mono, Panel, Rule } from "@/components/momentum/primitives";
import { readJournal } from "@/lib/core/journal";
import { agentPresence } from "@/lib/view/agents";
import { allowedToolNames } from "@/mcp/allowlist";
import { relativeLabel } from "@/lib/ui/momentum";
import type { ProviderProfile, ProviderType } from "@/lib/core/types";

const MCP_SNIPPET = `{
  "mcpServers": {
    "planner": {
      "command": "npm",
      "args": ["run", "--silent", "mcp"],
      "env": { "PLANNER_AGENT": "claude-code" }
    }
  }
}`;

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  "claude-subscription": "claude subscription",
  "anthropic-api": "anthropic api",
  "openai-compatible": "openai-compatible",
  openrouter: "openrouter",
  deepseek: "deepseek",
};

interface Source {
  key: string;
  name: string;
  color: string;
  connected: boolean;
  detail: string;
  envName: string | null;
  baseUrl?: string;
  favourites: ProviderProfile[];
  hasDefault: boolean;
}

const SOURCE_COLORS = ["#63b894", "#7d95dd", "#c48bc9", "#d9a463", "#8fbfc9", "#c9857a"];

function envSet(name: string | null): boolean {
  if (!name) return false;
  const value = process.env[name];
  return value !== undefined && value !== "";
}

export default async function AgentsPage() {
  const providers = await getProviders();
  const agents = agentPresence(await readJournal(30));
  const exposed = new Set(allowedToolNames());
  const byType = (t: ProviderType) => providers.profiles.filter((p) => p.type === t);
  const hasDefault = (profiles: ProviderProfile[]) =>
    profiles.some((p) => p.id === providers.default);

  const sources: Source[] = [];

  const subs = byType("claude-subscription");
  sources.push({
    key: "claude-subscription",
    name: "Claude subscription",
    color: SOURCE_COLORS[0],
    connected: true,
    detail: subs.length
      ? subs.map((p) => `${p.model}${p.effort ? ` · ${p.effort}` : ""}`).join(", ")
      : "no profile yet",
    envName: null,
    favourites: subs,
    hasDefault: hasDefault(subs),
  });

  (["openrouter", "deepseek"] as const).forEach((type, i) => {
    const preset = PROVIDER_PRESETS[type];
    const profiles = byType(type);
    sources.push({
      key: type,
      name: preset.label,
      color: SOURCE_COLORS[(i + 1) % SOURCE_COLORS.length],
      connected: envSet(preset.apiKeyEnv),
      detail: `${profiles.length} favourite${profiles.length === 1 ? "" : "s"}`,
      envName: preset.apiKeyEnv,
      baseUrl: preset.baseUrl,
      favourites: profiles,
      hasDefault: hasDefault(profiles),
    });
  });

  const customs = providers.profiles.filter(
    (p) => p.type === "openai-compatible" || p.type === "anthropic-api",
  );
  customs.forEach((p, i) => {
    const envName = apiKeyEnvOf(p);
    sources.push({
      key: p.id,
      name: p.label,
      color: SOURCE_COLORS[(i + 3) % SOURCE_COLORS.length],
      connected: envName ? envSet(envName) : true,
      detail: `${TYPE_LABEL[p.type] ?? p.type} · ${p.model}${p.effort ? ` · ${p.effort}` : ""}`,
      envName,
      baseUrl: p.baseUrl,
      favourites: [p],
      hasDefault: providers.default === p.id,
    });
  });

  return (
    <div className="mx-auto max-w-[800px] px-9 pt-[52px] pb-[90px]">
      <h1 className="m-0 mb-1.5 text-2xl font-semibold tracking-[-0.03em]">Agents</h1>
      <Mono className="mb-[26px] block text-[10.5px] tracking-[0.06em] text-faint">
        MCP SERVER OVER STDIO · {exposed.size} OF {toolNames.length} TOOLS EXPOSED TO CODING
        AGENTS
      </Mono>

      <Rule label="CONNECTED AGENTS" />
      <div className="mb-[30px] flex flex-col gap-[11px]">
        {agents.length === 0 ? (
          <Panel dashed className="px-5 py-[18px]">
            <div className="mb-2 text-[13px] text-dim">
              No agent has called the Planner MCP server yet. Drop this in{" "}
              <Mono className="text-[11px] text-ink">.mcp.json</Mono> at the root of a project
              repo:
            </div>
            <pre className="overflow-x-auto rounded-[12px] bg-soft px-3.5 py-3 font-mono text-[11px] leading-[1.6] text-dim">
              {MCP_SNIPPET}
            </pre>
          </Panel>
        ) : (
          agents.map((a) => (
            <Panel key={a.name} className="px-5 py-[18px]" accent={a.color}>
              <div className="mb-3 flex flex-wrap items-center gap-[11px]">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: a.color }} />
                <span className="text-[15.5px] font-semibold tracking-[-0.02em]">{a.name}</span>
                <Mono
                  className="rounded-md px-2 py-[3px] text-[9px] tracking-[0.1em]"
                  style={{
                    color: "var(--color-quick-ink)",
                    background: "var(--color-quick-tint)",
                  }}
                >
                  {relativeLabel(a.lastSeen)} {a.lastTime}
                </Mono>
                <Mono className="text-[9.5px] text-faint">
                  {a.calls} write{a.calls === 1 ? "" : "s"}
                </Mono>
              </div>
              <div className="flex flex-wrap gap-[7px]">
                {a.tools.slice(0, 6).map((t) => (
                  <Mono
                    key={t.name}
                    className="rounded-[7px] bg-soft px-[9px] py-[5px] text-[9.5px] text-dim"
                  >
                    {t.name} ×{t.calls}
                  </Mono>
                ))}
              </div>
            </Panel>
          ))
        )}
      </div>

      <Rule label="SOURCES" />
      <div className="mb-[30px] flex flex-col gap-[11px]">
        {sources.map((s) => (
          <Panel key={s.key} className="px-5 py-[18px]">
            <div className="mb-3.5 flex flex-wrap items-center gap-[11px]">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
              <span className="text-[15.5px] font-semibold tracking-[-0.02em]">{s.name}</span>
              <Mono
                className="rounded-md px-2 py-[3px] text-[9px] tracking-[0.1em]"
                style={{
                  color: s.connected ? "var(--color-quick-ink)" : "var(--color-dim)",
                  background: s.connected ? "var(--color-quick-tint)" : "var(--color-soft)",
                }}
              >
                {s.connected ? "CONNECTED" : "NEEDS KEY"}
              </Mono>
              {s.hasDefault && (
                <Mono className="rounded-md border border-edge px-2 py-[3px] text-[9px] tracking-[0.1em] text-dim">
                  DEFAULT
                </Mono>
              )}
            </div>
            <div className="mb-3.5 flex flex-wrap gap-[7px]">
              <Mono
                className={`rounded-[7px] bg-soft px-[9px] py-[5px] text-[9.5px] ${
                  s.envName ? "text-dim" : "text-faint"
                }`}
              >
                {s.envName ?? "no key needed"}
              </Mono>
              {s.baseUrl && (
                <Mono className="rounded-[7px] bg-soft px-[9px] py-[5px] text-[9.5px] text-dim">
                  {s.baseUrl}
                </Mono>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-[10px]">
              <Mono className="text-[9.5px] text-faint">{s.detail}</Mono>
              {s.favourites.slice(0, 4).map((p) => (
                <Mono
                  key={p.id}
                  className="rounded-[5px] bg-soft px-[7px] py-[3px] text-[9px] text-dim"
                >
                  {p.label}
                </Mono>
              ))}
            </div>
          </Panel>
        ))}
      </div>

      <Rule label="EXPOSED TOOLS" />
      <div className="overflow-hidden rounded-[18px] border border-edge bg-surf">
        {toolNames.map((t) => (
          <div
            key={t}
            className="grid grid-cols-1 gap-[5px] border-b border-edge2 px-[18px] py-[13px] last:border-b-0 md:grid-cols-[150px_minmax(0,1fr)] md:gap-3.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Mono className="text-[11.5px] text-ink">{t}</Mono>
              {exposed.has(t) && (
                <Mono className="rounded-[5px] border border-edge px-[6px] py-[2px] text-[8.5px] tracking-[0.1em] text-faint">
                  MCP
                </Mono>
              )}
            </div>
            <span className="text-[12.5px] text-dim">{toolDescriptions[t]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
