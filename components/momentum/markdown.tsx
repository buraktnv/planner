import Link from "next/link";
import { isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { slugifyHeading } from "@/lib/view/doc";
import { isInternalHref } from "@/lib/view/task";

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return "";
}

/**
 * Heading ids must match the anchors `tocOf` produces, and duplicates are
 * numbered the same way, so the on-this-page index always lands somewhere.
 * The counter is per render, so it lives in a factory rather than a constant.
 */
function anchorFor(children: ReactNode, seen: Map<string, number>): string {
  const slug = slugifyHeading(textOf(children));
  const n = seen.get(slug) ?? 0;
  seen.set(slug, n + 1);
  return n === 0 ? slug : `${slug}-${n + 1}`;
}

function components(seen: Map<string, number>): Components {
  return {
  h1: ({ children }) => (
    <h1 className="mt-5 mb-2 text-[17px] font-semibold tracking-[-0.02em] text-ink first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2
      id={anchorFor(children, seen)}
      className="mt-6 mb-2 scroll-mt-6 text-[16px] font-semibold tracking-[-0.02em] text-ink first:mt-0"
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3
      id={anchorFor(children, seen)}
      className="mt-5 mb-1.5 scroll-mt-6 text-[13.5px] font-semibold tracking-[-0.01em] text-ink first:mt-0"
    >
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-3.5 mb-1.5 font-mono text-[10px] tracking-[0.12em] text-faint uppercase first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => <p className="mb-2.5 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="mb-2.5 flex list-disc flex-col gap-1 pl-[18px] last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2.5 flex list-decimal flex-col gap-1 pl-[18px] last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-[1.6]">{children}</li>,
  a: ({ href, children }) => {
    const style = "text-dim underline underline-offset-2 transition-colors hover:text-ink";
    // A link into the app navigates here; only the outside world gets a new tab.
    return isInternalHref(href) ? (
      <Link href={href!} className={style}>
        {children}
      </Link>
    ) : (
      <a href={href} target="_blank" rel="noreferrer noopener" className={style}>
        {children}
      </a>
    );
  },
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="mb-2.5 border-l-2 border-edge pl-3 text-dim last:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-0 border-t border-edge2" />,
  pre: ({ children }) => (
    <pre className="mb-2.5 overflow-x-auto rounded-[8px] bg-soft p-3 font-mono text-[11.5px] leading-[1.55] last:mb-0">
      {children}
    </pre>
  ),
  code: ({ className, children }) => {
    const text = String(children ?? "");
    const block = (className ?? "").includes("language-") || text.includes("\n");
    if (block) {
      return <code className="font-mono text-[11.5px] leading-[1.55]">{children}</code>;
    }
    return (
      <code className="rounded-[5px] bg-soft px-[5px] py-[2px] font-mono text-[11.5px]">
        {children}
      </code>
    );
  },
  table: ({ children }) => (
    <div className="mb-2.5 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-[12px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-edge2 bg-soft px-2 py-1 text-left font-medium text-dim">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-edge2 px-2 py-1 align-top">{children}</td>,
    input: ({ checked }) => (
      <input type="checkbox" checked={checked} readOnly className="mr-1.5 align-middle" />
    ),
  };
}

export default function Markdown({
  children,
  className = "text-[13px] leading-[1.65] text-ink",
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components(new Map())}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
