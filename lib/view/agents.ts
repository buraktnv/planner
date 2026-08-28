import type { JournalDay } from "@/lib/core/journal";
import { hueOf } from "@/lib/ui/momentum";

export interface AgentToolUse {
  name: string;
  calls: number;
}

export interface AgentPresence {
  name: string;
  lastSeen: string;
  lastTime: string;
  calls: number;
  tools: AgentToolUse[];
  color: string;
}

export function agentPresence(days: JournalDay[]): AgentPresence[] {
  const acc = new Map<
    string,
    { calls: number; lastSeen: string; lastTime: string; tools: Map<string, number> }
  >();

  for (const day of days) {
    for (const entry of day.entries) {
      if (!entry.scope.startsWith("agent:")) continue;
      const name = entry.scope.slice("agent:".length).trim();
      if (!name) continue;
      let rec = acc.get(name);
      if (!rec) {
        rec = { calls: 0, lastSeen: day.date, lastTime: entry.time, tools: new Map() };
        acc.set(name, rec);
      }
      rec.calls += 1;
      if (
        day.date > rec.lastSeen ||
        (day.date === rec.lastSeen && entry.time > rec.lastTime)
      ) {
        rec.lastSeen = day.date;
        rec.lastTime = entry.time;
      }
      const tool = entry.message.trim().split(/\s+/)[0];
      if (tool) rec.tools.set(tool, (rec.tools.get(tool) ?? 0) + 1);
    }
  }

  return [...acc.entries()]
    .map(([name, rec]) => ({
      name,
      lastSeen: rec.lastSeen,
      lastTime: rec.lastTime,
      calls: rec.calls,
      color: hueOf(name).color,
      tools: [...rec.tools.entries()]
        .map(([toolName, calls]) => ({ name: toolName, calls }))
        .sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name)),
    }))
    .sort(
      (a, b) =>
        b.lastSeen.localeCompare(a.lastSeen) ||
        b.lastTime.localeCompare(a.lastTime) ||
        a.name.localeCompare(b.name),
    );
}
