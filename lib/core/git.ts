import { simpleGit } from "simple-git";
import { dataRoot } from "./paths";

export async function commitData(message: string): Promise<void> {
  const git = simpleGit(dataRoot());
  if (!(await git.checkIsRepo())) {
    throw new Error(`Data root is not a git repo: ${dataRoot()}`);
  }
  try {
    await git.add("-A");
    const status = await git.status();
    if (status.staged.length || status.modified.length || status.not_added.length) {
      await git.commit(message);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to commit data at ${dataRoot()}: ${reason}`);
  }
}
