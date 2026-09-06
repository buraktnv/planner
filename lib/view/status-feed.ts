import { listMarkedEntries, type LoggedEntry } from "@/lib/core/comments";
import { STATUS_MARKER, idsIn, parseStatus } from "@/lib/core/status";
import type { Workspace } from "./workspace";
import { taskHref } from "./task";

/**
 * The day's decisions in one place. A status entry lives in the log of the
 * task it happened on; this gathers the latest few across every live charter
 * so the owner reads them without opening each task. Built on request, never
 * cached, and pure below `loadStatusFeed` so the shaping can be tested.
 */
export interface StatusFeedItem {
  key: string;
  taskId: string;
  charterName: string;
  color: string;
  href: string;
  date: string;
  time: string;
  happened: string;
  changed: string;
  next: string;
  /** Ids named in "what changed elsewhere", each with a page when one exists. */
  refs: { id: string; href: string | null }[];
}

export const STATUS_FEED_LIMIT = 6;

export function buildStatusFeed(
  entries: LoggedEntry[],
  ws: Pick<Workspace, "byId">,
  limit = STATUS_FEED_LIMIT,
): StatusFeedItem[] {
  const out: StatusFeedItem[] = [];
  for (const e of entries) {
    const parts = parseStatus(e.body) ?? { happened: e.body, changed: "", next: "" };
    const charter = ws.byId.get(`${e.type}/${e.slug}`);
    out.push({
      key: `${e.type}/${e.slug}/${e.taskId}/${e.date}-${e.time}`,
      taskId: e.taskId,
      charterName: charter?.name ?? e.slug,
      color: charter?.color ?? "var(--color-faint)",
      href: taskHref(e.type, e.slug, e.taskId),
      date: e.date,
      time: e.time,
      happened: parts.happened,
      changed: parts.changed,
      next: parts.next,
      refs: idsIn(parts.changed).map((id) => ({
        id,
        href: id.startsWith("K-")
          ? `/knowledge/${id}`
          : id.startsWith("T-")
            ? taskHref(e.type, e.slug, id)
            : null,
      })),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function loadStatusFeed(ws: Workspace): Promise<StatusFeedItem[]> {
  const charters = ws.charters.map((c) => ({ type: c.type, slug: c.id }));
  const entries = await listMarkedEntries(charters, STATUS_MARKER, STATUS_FEED_LIMIT);
  return buildStatusFeed(entries, ws);
}
