import { getProviders } from "@/lib/core/providers";
import { toolNames, toolDescriptions } from "@/lib/ai/schemas";
import { Mono, Panel, Rule } from "@/components/momentum/primitives";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  "claude-subscription": "claude subscription",
  "anthropic-api": "anthropic api",
  "openai-compatible": "openai-compatible",
};

const AGENT_COLORS = ["#63b894", "#7d95dd", "#c48bc9", "#d9a463", "#8fbfc9", "#c9857a"];

export default async function AgentsPage() {
  const providers = await getProviders();

  const agents = providers.profiles.map((p, i) => {
    const keySet = p.apiKeyEnv ? process.env[p.apiKeyEnv] !== undefined : false;
    const connected = p.type === "claude-subscription" || keySet;
    return {
      id: p.id,
      name: p.label,
      color: AGENT_COLORS[i % AGENT_COLORS.length],
      host: `${TYPE_LABEL[p.type] ?? p.type} · ${p.model}`,
      isDefault: providers.default === p.id,
      apiKeyEnv: p.apiKeyEnv,
      baseUrl: p.baseUrl,
      connected,
    };
  });

  return (
    <div className="mx-auto max-w-[800px] px-9 pt-[52px] pb-[90px]">
      <h1 className="m-0 mb-1.5 text-2xl font-semibold tracking-[-0.03em]">Agents</h1>
      <Mono className="mb-[26px] block text-[10.5px] tracking-[0.06em] text-faint">
        NO MCP SERVER YET — THESE ARE THE PROVIDER PROFILES THE WEB CHAT USES TODAY
      </Mono>

      <div className="mb-[30px] flex flex-col gap-[11px]">
        {agents.length === 0 ? (
          <p className="m-0 text-[13.5px] text-faint">
            No provider profiles configured. Add one in Settings.
          </p>
        ) : (
          agents.map((a) => (
            <Panel key={a.id} className="px-5 py-[18px]">
              <div className="mb-3.5 flex flex-wrap items-center gap-[11px]">
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ background: a.color }}
                />
                <span className="text-[15.5px] font-semibold tracking-[-0.02em]">{a.name}</span>
                <Mono
                  className="rounded-md px-2 py-[3px] text-[9px] tracking-[0.1em]"
                  style={{
                    color: a.connected ? "var(--color-quick-ink)" : "var(--color-dim)",
                    background: a.connected ? "var(--color-quick-tint)" : "var(--color-soft)",
                  }}
                >
                  {a.connected ? "CONNECTED" : "NEEDS KEY"}
                </Mono>
                {a.isDefault && (
                  <Mono className="rounded-md border border-edge px-2 py-[3px] text-[9px] tracking-[0.1em] text-dim">
                    DEFAULT
                  </Mono>
                )}
              </div>
              <div className="mb-3.5 flex flex-wrap gap-[7px]">
                {a.apiKeyEnv ? (
                  <Mono className="rounded-[7px] bg-soft px-[9px] py-[5px] text-[9.5px] text-dim">
                    {a.apiKeyEnv}
                  </Mono>
                ) : (
                  <Mono className="rounded-[7px] bg-soft px-[9px] py-[5px] text-[9.5px] text-faint">
                    no key needed
                  </Mono>
                )}
                {a.baseUrl && (
                  <Mono className="rounded-[7px] bg-soft px-[9px] py-[5px] text-[9.5px] text-dim">
                    {a.baseUrl}
                  </Mono>
                )}
              </div>
              <div className="flex flex-wrap gap-[22px]">
                <Mono className="text-[9.5px] text-faint">{a.host}</Mono>
              </div>
            </Panel>
          ))
        )}
      </div>

      <Rule label="EXPOSED TOOLS" />
      <div className="overflow-hidden rounded-[18px] border border-edge bg-surf">
        {toolNames.map((t) => (
          <div
            key={t}
            className="grid grid-cols-1 gap-[5px] border-b border-edge2 px-[18px] py-[13px] last:border-b-0 md:grid-cols-[150px_minmax(0,1fr)] md:gap-3.5"
          >
            <Mono className="text-[11.5px] text-ink">{t}</Mono>
            <span className="text-[12.5px] text-dim">{toolDescriptions[t]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
