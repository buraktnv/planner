import { Mono } from "../primitives";
import type { TocEntry } from "@/lib/view/doc";

export default function DocToc({ toc }: { toc: TocEntry[] }) {
  if (toc.length < 3) return null;
  return (
    <div className="mb-5 rounded-[14px] border border-edge2 px-[15px] py-[13px]">
      <Mono className="mb-2 block text-[8.5px] tracking-[0.16em] text-faint">ON THIS PAGE</Mono>
      <div className="flex flex-col gap-[3px]">
        {toc.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            className={`text-[12.5px] leading-[1.4] text-dim transition-colors hover:text-ink ${
              t.depth === 3 ? "pl-3.5" : ""
            }`}
          >
            {t.text}
          </a>
        ))}
      </div>
    </div>
  );
}
