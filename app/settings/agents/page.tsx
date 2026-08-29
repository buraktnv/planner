import { toolNames, toolDescriptions } from "@/lib/ai/schemas";
import { Mono, Panel, Rule } from "@/components/momentum/primitives";
import { readJournal } from "@/lib/core/journal";
import { agentPresence } from "@/lib/view/agents";
import { allowedToolNames } from "@/mcp/allowlist";
import { relativeLabel } from "@/lib/ui/momentum";

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

export default async function AgentsPage() {
  const agents = agentPresence(await readJournal(30));
  const exposed = new Set(allowedToolNames());

  return (
    <div>
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
