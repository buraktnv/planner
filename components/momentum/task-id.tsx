import Link from "next/link";
import type { ProjectType } from "@/lib/core/types";
import { taskHref } from "@/lib/view/task";
import { Mono } from "./primitives";

/**
 * The id is the one label present on every rendering of a task, so it is the
 * one thing that should always open it.
 */
export default function TaskIdLink({
  type,
  slug,
  id,
  from,
  className = "text-[9.5px] text-faint",
}: {
  type: ProjectType;
  slug: string;
  id: string;
  from?: string;
  className?: string;
}) {
  const href = `${taskHref(type, slug, id)}${from ? `?from=${encodeURIComponent(from)}` : ""}`;
  return (
    <Link href={href} aria-label={`Open ${id}`} className="shrink-0">
      <Mono className={`${className} transition-colors hover:text-ink hover:underline`}>
        {id}
      </Mono>
    </Link>
  );
}
