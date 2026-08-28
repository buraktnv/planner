import path from "node:path";
import { simpleGit } from "simple-git";
import { dataRoot } from "./paths";

function samePath(a: string, b: string): boolean {
  const norm = (p: string) => path.resolve(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

export async function commitData(message: string): Promise<void> {
  const root = dataRoot();
  const git = simpleGit(root);
  if (!(await git.checkIsRepo())) {
    throw new Error(`Data root is not a git repo: ${root}`);
  }
  const top = (await git.revparse(["--show-toplevel"])).trim();
  if (!samePath(top, root)) {
    throw new Error(
      `Data root is not a git repo of its own (it sits inside ${top}): ${root}. Run git init in the data directory.`,
    );
  }
  try {
    await git.add("-A");
    const status = await git.status();
    if (status.staged.length || status.modified.length || status.not_added.length) {
      await git.commit(message);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to commit data at ${root}: ${reason}`);
  }
}
