/**
 * Run a project's knowledge harness by hand:
 *
 *   npx tsx scripts/harness.ts <slug> [--profile <id>]
 *
 * Each question is asked with the same system context the chat would build for
 * that focused charter, with no tools, and graded on keywords. It reads the
 * data repo and writes nothing to it: a measurement that changed the thing it
 * measures would be worthless.
 */
import { generateText } from "ai";
import { readHarness } from "../lib/core/harness";
import { listCharters } from "../lib/core/store";
import { getProviders } from "../lib/core/providers";
import { resolveModel } from "../lib/ai/providers";
import { buildSystemContext } from "../lib/ai/context";
import { aggregate, resultFor, type HarnessResult } from "../lib/view/harness-score";
import { loadEnvFile, plannerRoot, requireDataRoot } from "../mcp/planner";

interface Args {
  slug: string;
  profileId?: string;
}

function parseArgs(argv: string[]): Args {
  const rest: string[] = [];
  let profileId: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--profile") {
      profileId = argv[++i];
      continue;
    }
    rest.push(argv[i]);
  }
  if (!rest[0]) {
    throw new Error("Usage: npx tsx scripts/harness.ts <slug> [--profile <id>]");
  }
  return { slug: rest[0], ...(profileId ? { profileId } : {}) };
}

async function main(): Promise<void> {
  const { slug, profileId } = parseArgs(process.argv.slice(2));
  loadEnvFile(plannerRoot());
  requireDataRoot();

  const harness = await readHarness(slug);
  if (harness.questions.length === 0) {
    throw new Error(`harness/${slug}.md has no questions this build understands`);
  }

  const charter = (await listCharters()).find((c) => c.id === slug);
  if (!charter) {
    throw new Error(`No charter with slug ${slug}; the harness must name a project or area`);
  }
  const focus = { type: charter.type, slug };

  const { profiles, default: defaultId } = await getProviders();
  const profile =
    (profileId && profiles.find((p) => p.id === profileId)) ||
    profiles.find((p) => p.id === defaultId);
  if (!profile) {
    throw new Error(profileId ? `No provider profile ${profileId}` : "No default provider profile");
  }
  if (profile.type === "claude-subscription") {
    throw new Error(
      `Profile ${profile.id} is a Claude subscription, which is chat-only. Pass --profile with an API profile.`,
    );
  }
  const resolved = resolveModel(profile);

  const results: HarnessResult[] = [];
  for (const question of harness.questions) {
    const system = await buildSystemContext(focus, undefined, question.q);
    const { text } = await generateText({
      model: resolved.model,
      ...(resolved.providerOptions ? { providerOptions: resolved.providerOptions } : {}),
      system,
      prompt: question.q,
    });
    const result = resultFor(question.q, text, question.keywords);
    results.push(result);
    process.stdout.write(
      result.pass
        ? `PASS ${question.q}\n`
        : `FAIL ${question.q} — missing: ${result.missing.join(", ")}\n`,
    );
  }

  const { passed, total, allPassed } = aggregate(results);
  process.stdout.write(`\n${passed}/${total} passed\n`);
  if (!allPassed) process.exitCode = 1;
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
