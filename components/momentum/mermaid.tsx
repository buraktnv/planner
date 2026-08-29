"use client";

import dynamic from "next/dynamic";

/**
 * The boundary that keeps mermaid out of the main bundle.
 *
 * ssr:false is mandatory rather than an optimisation: mermaid touches document
 * and window at init. It is also illegal in a server component, which is why
 * this wrapper is its own "use client" file that markdown.tsx merely
 * references — markdown.tsx itself has no directive and is rendered on the
 * server on most pages.
 */
const MermaidRender = dynamic(() => import("./mermaid-render"), {
  ssr: false,
  loading: () => (
    <div className="my-2.5 grid h-[120px] place-items-center rounded-[10px] border border-dashed border-edge2">
      <span className="font-mono text-[9px] tracking-[0.12em] text-faint">DIAGRAM…</span>
    </div>
  ),
});

export default function Mermaid({ source }: { source: string }) {
  return <MermaidRender source={source} />;
}
