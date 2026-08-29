"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Rendered SVG by source, module-global on purpose: mermaid parses and lays out
 * on the main thread, so remounting a diagram already drawn should cost nothing.
 */
const cache = new Map<string, string>();

interface State {
  src: string;
  svg: string | null;
  failed: boolean;
}

function initial(source: string): State {
  return { src: source, svg: cache.get(source) ?? null, failed: false };
}

export default function MermaidRender({ source }: { source: string }) {
  const reactId = useId();
  const [state, setState] = useState<State>(() => initial(source));
  const idRef = useRef(`mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`);

  // Adjusting state during render is the supported way to react to a changed
  // prop, and it means a cached diagram is never blank for a frame first.
  if (state.src !== source) setState(initial(source));

  useEffect(() => {
    if (cache.has(source)) return;

    // React invokes an effect twice in development, and mermaid.render appends
    // a temporary node keyed by the id it is given, so a second pass with a
    // fixed id throws. The flag also stops a slow render landing after the
    // source has changed underneath it.
    let dead = false;

    (async () => {
      try {
        // Imported here, not at module scope: a top-level import would pull
        // half a megabyte into whatever bundle loads this file and defeat the
        // dynamic() wrapper entirely.
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          // Diagram text comes from notes an AI may have written; strict stops
          // a label carrying raw HTML or a click handler.
          securityLevel: "strict",
          theme: "neutral",
          fontFamily: "inherit",
        });
        const { svg } = await mermaid.render(idRef.current, source);
        cache.set(source, svg);
        if (!dead) setState({ src: source, svg, failed: false });
      } catch {
        if (!dead) setState({ src: source, svg: null, failed: true });
      }
    })();

    return () => {
      dead = true;
    };
  }, [source]);

  if (state.failed) {
    // The source is still the truth, so show it rather than an error: a
    // half-typed diagram is the normal case, not a broken note.
    return (
      <pre className="my-2.5 overflow-x-auto rounded-[10px] border border-edge2 bg-soft p-3">
        <code className="font-mono text-[11.5px] leading-[1.55] text-dim">{source}</code>
      </pre>
    );
  }

  if (!state.svg) {
    return (
      <div className="my-2.5 grid h-[120px] place-items-center rounded-[10px] border border-dashed border-edge2">
        <span className="font-mono text-[9px] tracking-[0.12em] text-faint">DIAGRAM…</span>
      </div>
    );
  }

  return (
    <div
      className="my-2.5 overflow-x-auto rounded-[10px] border border-edge2 bg-surf p-3 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
      // mermaid sanitises its own output under securityLevel: "strict".
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}
