import Link from "next/link";
import { isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { headingIdsByLine, slugifyHeading } from "@/lib/view/doc";
import { rewriteAssetSrc } from "@/lib/view/markdown-assets";
import { isMermaidFence } from "@/lib/view/mermaid";
import Mermaid from "./mermaid";
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
 * Heading ids must match the anchors `tocOf` produces, so both come from one
 * scan of the source and are looked up by the heading's own line number.
 */
function anchorFor(
  node: { position?: { start?: { line?: number } } } | undefined,
  children: ReactNode,
  ids: Map<number, string>,
): string {
  const line = node?.position?.start?.line;
  const byLine = line === undefined ? undefined : ids.get(line);
  return byLine ?? slugifyHeading(textOf(children));
}

function components(ids: Map<number, string>, diagrams: boolean): Components {
  return {
  h1: ({ children }) => (
    <h1 className="mt-5 mb-2 text-[17px] font-semibold tracking-[-0.02em] text-ink first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children, node }) => (
    <h2
      id={anchorFor(node, children, ids)}
      className="mt-6 mb-2 scroll-mt-6 text-[16px] font-semibold tracking-[-0.02em] text-ink first:mt-0"
    >
      {children}
    </h2>
  ),
  h3: ({ children, node }) => (
    <h3
      id={anchorFor(node, children, ids)}
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
  // A fenced block arrives here wrapping its <code>, which is where the
  // language lives — and where a diagram has to be caught, since rendering one
  // from the <code> override would nest a <div> inside a <pre>.
  pre: ({ children }) => {
    const inner = isValidElement(children)
      ? (children.props as { className?: string; children?: ReactNode })
      : null;
    if (inner && isMermaidFence(inner.className)) {
      const source = textOf(inner.children).replace(/\n$/, "");
      if (!diagrams) {
        return (
          <span className="my-1.5 inline-flex items-center gap-1.5 rounded-[7px] border border-edge2 px-2 py-1 font-mono text-[9px] tracking-[0.1em] text-faint">
            ◇ DIAGRAM
          </span>
        );
      }
      return <Mermaid source={source} />;
    }
    return (
      <pre className="mb-2.5 overflow-x-auto rounded-[8px] bg-soft p-3 font-mono text-[11.5px] leading-[1.55] last:mb-0">
        {children}
      </pre>
    );
  },
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
    img: ({ src, alt, title }) => {
      const resolved = rewriteAssetSrc(typeof src === "string" ? src : undefined);
      // An unresolvable source renders nothing rather than a broken-image icon:
      // the reference is the bug, and a missing picture says so more quietly.
      if (!resolved) return null;
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolved}
          alt={alt ?? ""}
          title={title}
          loading="lazy"
          decoding="async"
          className="my-2.5 h-auto max-w-full rounded-[10px] border border-edge2"
        />
      );
    },
    input: ({ checked }) => (
      <input type="checkbox" checked={checked} readOnly className="mr-1.5 align-middle" />
    ),
  };
}

export default function Markdown({
  children,
  className = "text-[13px] leading-[1.65] text-ink",
  diagrams = true,
}: {
  children: string;
  className?: string;
  /**
   * Off on a canvas card, where a mermaid block becomes a chip. Rendering one
   * per card would be a parse and layout pass each, through a module-global
   * singleton, on the main thread.
   */
  diagrams?: boolean;
}) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components(headingIdsByLine(children), diagrams)}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
