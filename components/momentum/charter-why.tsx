"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Markdown from "./markdown";
import { Mono } from "./primitives";
import { useImagePaste } from "./use-image-paste";

/**
 * The charter's `## Why`, on the charter's own page.
 *
 * It was written into every project and area and rendered nowhere: an area
 * with no tasks yet showed "Nothing open here" while the reason it exists sat
 * in the file, unread. This is the one block on the page that is true before
 * any work has been captured.
 */
export default function CharterWhy({
  type,
  slug,
  why,
  color,
}: {
  type: "project" | "area";
  slug: string;
  why: string;
  color: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(why);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  /**
   * The core card of a charter's map renders the Why as markdown, so a picture
   * pasted here is how that card says what the words cannot. Same handling as
   * a note body — one hook, one route, one markdown line.
   */
  const { onPaste, onDrop, onDragOver, uploading } = useImagePaste(ref, value, setValue, setError);

  const text = why.trim();

  async function save() {
    const next = value.trim();
    // The route rejects an empty why, and a charter without one cannot be
    // re-parsed — so refuse here rather than surfacing a 400.
    if (!next) {
      setError("A charter needs a why. Say what this is for.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/charters/${type}/${slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ why: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not save that.");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <section className="mb-4">
        <div className="mb-1.5 flex items-center gap-2.5">
          <Mono className="text-[9px] tracking-[0.12em] text-faint">WHY</Mono>
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            className="font-mono text-[9px] tracking-[0.08em] text-faint transition-colors hover:text-ink"
          >
            {preview ? "EDIT" : "PREVIEW"}
          </button>
          {uploading && (
            <Mono className="text-[9px] tracking-[0.08em] text-faint">ADDING THE IMAGE…</Mono>
          )}
        </div>
        {preview ? (
          <div
            className="rounded-2xl border border-edge bg-surf px-[18px] py-4"
            style={{ borderLeft: `3px solid ${color}` }}
          >
            {value.trim() ? (
              <Markdown className="text-[13px] leading-[1.65] text-ink">{value}</Markdown>
            ) : (
              <span className="text-[13px] text-faint">Nothing to preview yet.</span>
            )}
          </div>
        ) : (
          <textarea
            ref={ref}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onPaste={onPaste}
            onDragOver={onDragOver}
            onDrop={onDrop}
            rows={6}
            placeholder="What this is for, and why it is worth the time… Paste or drop an image to add one."
            className="w-full resize-y rounded-[13px] border border-edge bg-surf px-3.5 py-3 text-[13px] leading-[1.65] outline-none placeholder:text-faint"
          />
        )}
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg border border-ink px-2.5 py-[5px] font-mono text-[9px] tracking-[0.08em] text-ink disabled:opacity-40"
          >
            {saving ? "SAVING…" : "SAVE"}
          </button>
          <button
            type="button"
            onClick={() => {
              setValue(why);
              setEditing(false);
              setPreview(false);
              setError(null);
            }}
            className="rounded-lg border border-edge px-2.5 py-[5px] font-mono text-[9px] tracking-[0.08em] text-faint transition-colors hover:text-dim"
          >
            CANCEL
          </button>
          {error && <span className="text-[12px] text-clay-ink">{error}</span>}
        </div>
      </section>
    );
  }

  return (
    <section className="group mb-4">
      <div className="mb-1.5 flex items-center gap-2.5">
        <Mono className="text-[9px] tracking-[0.12em] text-faint">WHY</Mono>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="font-mono text-[9px] tracking-[0.08em] text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink"
        >
          EDIT
        </button>
      </div>
      {text ? (
        <div className="rounded-2xl border border-edge bg-surf px-[18px] py-4" style={{ borderLeft: `3px solid ${color}` }}>
          <Markdown className="text-[13px] leading-[1.65] text-ink">{text}</Markdown>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full rounded-2xl border border-dashed border-edge px-[18px] py-4 text-left text-[13px] text-faint transition-colors hover:text-dim"
        >
          Nothing written yet. Say what this is for.
        </button>
      )}
    </section>
  );
}
