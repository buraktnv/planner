import Link from "next/link";
import { Mono } from "../primitives";
import type { DocGroup } from "@/lib/view/docs";
import { docHref } from "@/lib/view/doc";

export default function DocsSidebar({
  groups,
  scopeKey,
  currentId,
  indexHref,
  charterName,
}: {
  groups: DocGroup[];
  scopeKey: string;
  currentId: string;
  indexHref: string;
  charterName: string;
}) {
  return (
    <nav className="sticky top-[34px] hidden max-h-[calc(100vh-70px)] w-[196px] shrink-0 overflow-y-auto lg:block">
      <Link
        href={indexHref}
        className="mb-3 block font-mono text-[9.5px] tracking-[0.14em] text-faint transition-colors hover:text-ink"
      >
        ALL {charterName.toUpperCase()} DOCS
      </Link>
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.tag}>
            <Mono className="mb-1.5 block text-[8.5px] tracking-[0.16em] text-faint">
              {g.label.toUpperCase()}
            </Mono>
            <div className="flex flex-col">
              {g.rows.map((r) => {
                const active = r.id === currentId;
                return (
                  <Link
                    key={r.id}
                    href={docHref(r.id, scopeKey)}
                    aria-current={active ? "page" : undefined}
                    className={`border-l-2 py-[5px] pl-2.5 text-[12.5px] leading-[1.35] transition-colors ${
                      active
                        ? "border-ink font-medium text-ink"
                        : "border-edge2 text-dim hover:border-dim hover:text-ink"
                    }`}
                  >
                    {r.title}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
