import Link from "next/link";
import { Mono } from "../primitives";
import { shortDate } from "@/lib/ui/momentum";
import type { StatusFeedItem } from "@/lib/view/status-feed";

/**
 * The day's decisions without opening each task: the latest status entries
 * across every live charter, each linking to its task and to the ids it names.
 */
export default function StatusStrip({ items }: { items: StatusFeedItem[] }) {
  if (!items.length) return null;
  return (
    <div className="mb-[22px] rounded-[20px] border border-edge bg-surf px-[22px] py-[17px]">
      <Mono className="mb-3 block text-[9px] tracking-[0.14em] text-faint">STATUS</Mono>
      <div className="flex flex-col gap-3">
        {items.map((s) => (
          <div key={s.key} className="flex min-w-0 items-start gap-2.5">
            <span className="mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: s.color }} />
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <div className="flex flex-wrap items-baseline gap-2">
                <Link href={s.href} className="font-mono text-[10px] tracking-[0.08em] text-dim hover:text-ink">
                  {s.taskId}
                </Link>
                <Mono className="text-[9px] tracking-[0.08em] text-faint">
                  {s.charterName.toUpperCase()} · {shortDate(s.date)} {s.time}
                </Mono>
              </div>
              <span className="text-[13.5px] leading-[1.45]">{s.happened}</span>
              {s.changed && s.changed !== "nothing" ? (
                <span className="text-[12.5px] leading-[1.5] text-dim">
                  <span className="text-faint">Changed: </span>
                  {s.changed}
                </span>
              ) : null}
              {s.refs.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {s.refs.map((r) =>
                    r.href ? (
                      <Link
                        key={r.id}
                        href={r.href}
                        className="rounded-[5px] bg-soft px-[7px] py-[2px] font-mono text-[9px] text-dim hover:text-ink"
                      >
                        {r.id}
                      </Link>
                    ) : (
                      <Mono key={r.id} className="rounded-[5px] bg-soft px-[7px] py-[2px] text-[9px] text-faint">
                        {r.id}
                      </Mono>
                    ),
                  )}
                </div>
              ) : null}
              {s.next && s.next !== "nothing" ? (
                <span className="text-[12.5px] leading-[1.5] text-dim">
                  <span className="text-faint">Next: </span>
                  {s.next}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
