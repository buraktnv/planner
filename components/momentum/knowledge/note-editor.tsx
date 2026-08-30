"use client";

import { useState } from "react";
import Dialog from "../dialog";
import { Mono } from "../primitives";

export interface EditorValue {
  id?: string;
  title: string;
  summary: string;
  body: string;
  scope: string;
  tags: string;
  source: string;
}

const FIELD =
  "w-full rounded-[11px] border border-edge bg-bg px-3 py-2 text-[13px] outline-none transition-colors focus:border-ink";

function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <Mono className="mb-1.5 block text-[9px] tracking-[0.14em] text-faint">{label}</Mono>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-faint">{hint}</span> : null}
    </label>
  );
}

export default function NoteEditor({
  initial,
  onClose,
  onSaved,
  lockedScope,
}: {
  initial: EditorValue;
  onClose: () => void;
  onSaved: () => void;
  lockedScope?: string;
}) {
  const [value, setValue] = useState<EditorValue>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  /**
   * Paste or drop an image and it is copied into the data repo, then linked by
   * its relative path — so the note keeps working in a plain markdown editor,
   * on another machine, and after the original file is moved or deleted.
   */
  const addImage = async (files: FileList | File[] | null) => {
    const image = [...(files ?? [])].find((f) => f.type.startsWith("image/"));
    if (!image) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", image);
      const res = await fetch("/api/assets", { method: "POST", body: form });
      const out = (await res.json().catch(() => ({}))) as { ref?: string; error?: string };
      if (!res.ok || !out.ref) {
        setError(out.error ?? "Could not add that image.");
        return;
      }
      setValue((cur) => ({
        ...cur,
        body: `${cur.body}${cur.body.endsWith("\n") || cur.body === "" ? "" : "\n\n"}![](${out.ref})\n`,
      }));
    } catch {
      setError("Could not reach the server.");
    } finally {
      setUploading(false);
    }
  };
  const editing = Boolean(initial.id);

  const set = (patch: Partial<EditorValue>) => setValue((v) => ({ ...v, ...patch }));

  async function save() {
    if (!value.title.trim() || !value.summary.trim()) {
      setError("A note needs a title and a summary.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      title: value.title,
      summary: value.summary,
      body: value.body,
      scope: splitList(value.scope),
      tags: splitList(value.tags),
      source: value.source,
    };
    try {
      const res = await fetch(
        editing ? `/api/knowledge/${initial.id}` : "/api/knowledge",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Could not save the note.");
        setSaving(false);
        return;
      }
      onSaved();
    } catch {
      setError("Could not reach the server.");
      setSaving(false);
    }
  }

  return (
    <Dialog label={editing ? "Edit note" : "New note"} onClose={onClose} maxWidth={620}>
      <div className="mb-4 flex items-baseline gap-2.5">
        <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em]">
          {editing ? "Edit note" : "New note"}
        </h2>
        {editing ? (
          <Mono className="text-[10px] tracking-[0.1em] text-faint">{initial.id}</Mono>
        ) : null}
      </div>

      <div className="flex flex-col gap-3.5">
        <Field label="TITLE">
          <input
            className={FIELD}
            value={value.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="Why I abandoned the grid strategy"
          />
        </Field>

        <Field label="SUMMARY" hint="One line. State the conclusion — this is all chat sees until it searches.">
          <input
            className={FIELD}
            value={value.summary}
            onChange={(e) => set({ summary: e.target.value })}
            placeholder="Fixed spacing cannot survive a breakout."
          />
        </Field>

        <div className="grid grid-cols-2 gap-3.5">
          {lockedScope ? (
            <Field label="SCOPE" hint="Filed to this charter.">
              <input className={`${FIELD} text-dim`} value={value.scope || lockedScope} readOnly />
            </Field>
          ) : (
            <Field label="SCOPE" hint="Comma separated. acme-app, area:research">
              <input
                className={FIELD}
                value={value.scope}
                onChange={(e) => set({ scope: e.target.value })}
                placeholder="acme-app, area:research"
              />
            </Field>
          )}
          <Field label="TAGS" hint="Comma separated, lowercase.">
            <input
              className={FIELD}
              value={value.tags}
              onChange={(e) => set({ tags: e.target.value })}
              placeholder="strategy, postmortem"
            />
          </Field>
        </div>

        <Field
          label="NOTE"
          hint={
            uploading
              ? "Adding the image…"
              : "Markdown. Link other notes as [[K-009]]. Paste or drop an image to add one."
          }
        >
          <textarea
            className={`${FIELD} min-h-[180px] resize-y font-sans leading-[1.6]`}
            value={value.body}
            onChange={(e) => set({ body: e.target.value })}
            onPaste={(e) => {
              if (e.clipboardData.files.length === 0) return;
              e.preventDefault();
              void addImage(e.clipboardData.files);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              if (e.dataTransfer.files.length === 0) return;
              e.preventDefault();
              void addImage(e.dataTransfer.files);
            }}
          />
        </Field>

        <Field label="SOURCE" hint="Optional. Where this came from.">
          <input
            className={FIELD}
            value={value.source}
            onChange={(e) => set({ source: e.target.value })}
            placeholder="journal 2026-08-21"
          />
        </Field>
      </div>

      {error ? <div className="mt-3 text-[12.5px] text-wait-ink">{error}</div> : null}

      <div className="mt-5 flex items-center gap-2.5">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-[11px] bg-ink px-[15px] py-[9px] text-[12.5px] font-medium text-bg transition-opacity disabled:opacity-50"
        >
          {saving ? "Saving…" : editing ? "Save changes" : "File note"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-[11px] border border-edge bg-surf px-[15px] py-[9px] text-[12.5px] font-medium transition-colors hover:border-ink"
        >
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
