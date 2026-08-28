const INTERVAL_MS = 15 * 60 * 1000;
const KEY = "__plannerDistillTimer";

type TimerHost = typeof globalThis & { [KEY]?: NodeJS.Timeout };

export function register(): void {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.PLANNER_AUTO_DISTILL === "0") return;

  const host = globalThis as TimerHost;
  if (host[KEY]) clearInterval(host[KEY]);

  const timer = setInterval(() => {
    void import("./lib/ai/auto-distill")
      .then((m) => m.runDistillIfDue())
      .catch(() => undefined);
  }, INTERVAL_MS);
  timer.unref?.();
  host[KEY] = timer;
}
