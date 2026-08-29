import Link from "next/link";
import { Mono } from "../primitives";
import Markdown from "../markdown";
import { scopeChip } from "@/lib/view/knowledge";
import type { DocLink, DocPageModel } from "@/lib/view/doc";
import DocsSidebar from "./docs-sidebar";
import DocToc from "./doc-toc";
import DocEditButton from "./doc-edit-button";

function LinkRow({ label, links }: { label: string; links: DocLink[] }) {
  if (!links.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-baseline gap-2">
      <Mono className="text-[8.5px] tracking-[0.16em] text-faint">{label}</Mono>
      {links.map((l) => (
        <Link
          key={l.id}
          href={l.href}
          className="rounded-[6px] bg-soft px-[8px] py-[3px] text-[12px] text-dim transition-colors hover:text-ink"
        >
          {l.title}
        </Link>
      ))}
    </div>
  );
}

export default function DocPage({
  model,
  indexHref,
  backLabel,
}: {
  model: DocPageModel;
  indexHref: string;
  backLabel: string;
}) {
  const { note, scopeKey, charterName } = model;

  // On a charter's own docs page the scope chip only repeats the page you are
  // already on, so it is shown for out-of-scope charters only.
  const otherScopes = note.scope.filter((s) => s !== scopeKey);

  return (
    <div className="px-[30px] pt-[34px] pb-[70px]">
      <div className="mx-auto flex w-full max-w-[1000px] gap-9">
        {scopeKey && model.groups.length ? (
          <DocsSidebar
            groups={model.groups}
            scopeKey={scopeKey}
            currentId={note.id}
            indexHref={indexHref}
            charterName={charterName ?? scopeKey}
          />
        ) : null}

        <article className="min-w-0 flex-1">
          <div className="mb-4 flex items-center gap-3">
            <Link
              href={indexHref}
              className="font-mono text-[10px] tracking-[0.12em] text-faint transition-colors hover:text-ink lg:hidden"
            >
              ← {backLabel.toUpperCase()}
            </Link>
            <Mono className="text-[10px] tracking-[0.1em] text-faint">{note.id}</Mono>
            <div className="flex-1" />
            <DocEditButton note={note} lockedScope={scopeKey ?? undefined} />
          </div>

          <h1 className="m-0 text-[26px] font-semibold leading-[1.2] tracking-[-0.03em]">
            {note.title}
          </h1>
          <p className="mt-2.5 mb-0 text-[14.5px] leading-[1.5] text-dim">{note.summary}</p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-b border-edge pb-4">
            {note.tags.map((tag) => (
              <Mono
                key={tag}
                className="rounded-[5px] bg-soft px-[7px] py-[3px] text-[8.5px] tracking-[0.08em] text-dim"
              >
                {tag}
              </Mono>
            ))}
            {otherScopes.map((key) => {
              const chip = scopeChip(key);
              return (
                <Mono
                  key={key}
                  className="rounded-[5px] px-[7px] py-[3px] text-[8.5px] tracking-[0.08em]"
                  style={{ color: chip.color, background: chip.tint }}
                >
                  {chip.label.toUpperCase()}
                </Mono>
              );
            })}
            <div className="flex-1" />
            <Mono className="text-[8.5px] tracking-[0.12em] text-faint">
              UPDATED {note.updated}
            </Mono>
          </div>

          <div className="mt-5">
            <DocToc toc={model.toc} />
            {note.body.trim() ? (
              <Markdown className="text-[14px] leading-[1.7] text-ink">{model.body}</Markdown>
            ) : (
              <p className="text-[13px] text-faint">
                No body yet — the summary is all there is. Use Edit to write it up.
              </p>
            )}
          </div>

          <LinkRow label="LINKS TO" links={model.links} />
          <LinkRow label="LINKED FROM" links={model.backlinks} />

          {model.prev || model.next ? (
            <div className="mt-8 grid grid-cols-2 gap-3 border-t border-edge pt-4">
              {model.prev ? (
                <Link
                  href={model.prev.href}
                  className="rounded-[12px] border border-edge px-[14px] py-[11px] transition-colors hover:border-ink"
                >
                  <Mono className="mb-1 block text-[8.5px] tracking-[0.16em] text-faint">
                    PREVIOUS
                  </Mono>
                  <span className="text-[13px] font-medium">{model.prev.title}</span>
                </Link>
              ) : (
                <div />
              )}
              {model.next ? (
                <Link
                  href={model.next.href}
                  className="rounded-[12px] border border-edge px-[14px] py-[11px] text-right transition-colors hover:border-ink"
                >
                  <Mono className="mb-1 block text-[8.5px] tracking-[0.16em] text-faint">NEXT</Mono>
                  <span className="text-[13px] font-medium">{model.next.title}</span>
                </Link>
              ) : (
                <div />
              )}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <Mono className="text-[8.5px] tracking-[0.12em] text-faint">
              CREATED {note.created}
            </Mono>
            {note.source ? (
              <Mono className="text-[8.5px] tracking-[0.12em] text-faint">
                SOURCE {note.source}
              </Mono>
            ) : null}
          </div>
        </article>
      </div>
    </div>
  );
}
