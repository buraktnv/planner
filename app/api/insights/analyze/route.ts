import { NextRequest } from "next/server";
import { streamText } from "ai";
import { getInsights } from "@/lib/core/insights";
import { getProviders } from "@/lib/core/providers";
import { listCharters } from "@/lib/core/store";
import { readJournal } from "@/lib/core/journal";
import { resolveModel } from "@/lib/ai/providers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_req: NextRequest) {
  const { profiles, default: defaultId } = await getProviders();
  const profile = profiles.find((p) => p.id === defaultId);

  if (!profile) {
    return new Response(
      JSON.stringify({ error: "No default provider profile is set." }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  if (profile.type === "claude-subscription") {
    return new Response(
      JSON.stringify({
        error:
          "Weekly analysis requires a non-subscription default provider (set an OpenAI-compatible or Anthropic API provider as default).",
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const [insights, days, charters] = await Promise.all([
    getInsights(),
    readJournal(7),
    listCharters(),
  ]);

  const journalText = days.length
    ? days
        .map(
          (d) =>
            `### ${d.date}\n` +
            d.entries.map((e) => `- ${e.time} [${e.scope}] ${e.message}`).join("\n"),
        )
        .join("\n\n")
    : "(no journal entries in the last 7 days)";

  const chartersText = charters.length
    ? charters
        .map((c) => {
          const mvp =
            c.type === "project"
              ? `\nMVP scope:\n${c.mvpScope.map((s) => `  - ${s}`).join("\n") || "  (none)"}`
              : "";
          return `- ${c.type} ${c.id}: ${c.name} [${c.status}]\n  Why: ${c.why.trim() || "(none)"}${mvp}`;
        })
        .join("\n")
    : "(none)";

  const system = [
    "You are a planning coach for a local-first life/dev planner.",
    "Analyze the user's week using the data provided. Be concise and specific.",
    "Structure your response in these sections, using markdown:",
    "1. **What went well** — progress and momentum worth noting.",
    "2. **What stalled** — projects/areas with no recent activity or stuck tasks.",
    "3. **Scope-drift signals** — open work that goes beyond stated MVP scope; call out mismatches.",
    "4. **Top 3 suggested next actions** — the highest-leverage moves for next week.",
  ].join("\n");

  const prompt = [
    "# Insights (computed from task data)\n",
    JSON.stringify(insights, null, 2),
    "\n\n# Charters (MVP definitions & intent)\n",
    chartersText,
    "\n\n# Journal (last 7 days)\n",
    journalText,
  ].join("");

  const resolved = resolveModel(profile);

  const result = streamText({
    model: resolved.model,
    ...(resolved.providerOptions ? { providerOptions: resolved.providerOptions } : {}),
    system,
    prompt,
  });

  return result.toTextStreamResponse();
}
