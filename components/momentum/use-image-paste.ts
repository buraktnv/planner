"use client";

import { useCallback, useState, type DragEvent, type ClipboardEvent, type RefObject } from "react";
import { insertAtCursor, replacePlaceholder } from "@/lib/view/insert-at-cursor";

let seq = 0;

/**
 * Paste or drop an image into a markdown textarea.
 *
 * The image is copied into the data repo by `POST /api/assets` and linked by
 * its relative path, so the text keeps working in a plain markdown editor, on
 * another machine, and after the original file is moved or deleted. Two
 * editors want this — a note body and a charter's Why, whose picture is what
 * the core card of a map shows — so the behaviour lives here once rather than
 * being copied into the second one.
 *
 * **Every write is a functional update, and the upload writes twice.** An
 * upload is a network round trip and whoever pasted keeps typing through it.
 * So a placeholder goes in at the caret immediately, and the response only
 * swaps that placeholder for the real markdown; the alternative — computing
 * one whole new string from the value captured at paste time — silently
 * discards everything typed while the image was in flight, and puts the image
 * back where the caret *used* to be. `setValue` therefore takes an updater,
 * not a string.
 */
export function useImagePaste(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  setValue: (update: (current: string) => string) => void,
  onError?: (message: string | null) => void,
) {
  const [pending, setPending] = useState(0);
  // A second paste while the first is still uploading must not end the state
  // early, so this counts rather than flags.
  const bump = useCallback((by: number) => setPending((n) => Math.max(0, n + by)), []);

  const addImage = useCallback(
    async (files: FileList | File[] | null) => {
      const image = [...(files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!image) return;

      // `value` is current here and only here: a paste is handled by the
      // listener from the last committed render. Everything after the await
      // must go through an updater instead.
      const placeholder = `![uploading…](pending:${(seq += 1)})`;
      const el = ref.current;
      const text = value;
      const start = el ? el.selectionStart : text.length;
      const end = el ? el.selectionEnd : text.length;
      const placed = insertAtCursor(text, start, end, placeholder);
      setValue(() => placed.text);
      const caret = placed.cursor;

      bump(1);
      onError?.(null);
      try {
        const form = new FormData();
        form.append("file", image);
        const res = await fetch("/api/assets", { method: "POST", body: form });
        const out = (await res.json().catch(() => ({}))) as { ref?: string; error?: string };
        if (!res.ok || !out.ref) {
          setValue((cur) => replacePlaceholder(cur, placeholder, ""));
          onError?.(out.error ?? "Could not add that image.");
          return;
        }
        const snippet = `![](${out.ref})`;
        setValue((cur) => replacePlaceholder(cur, placeholder, snippet));
        // Only move the caret when nothing else has been typed — otherwise the
        // person is somewhere else in the text and yanking them back is worse
        // than leaving the caret where they put it.
        requestAnimationFrame(() => {
          const node = ref.current;
          if (!node || node.selectionStart !== caret) return;
          const to = caret - placeholder.length + snippet.length;
          node.setSelectionRange(to, to);
        });
      } catch {
        setValue((cur) => replacePlaceholder(cur, placeholder, ""));
        onError?.("Could not reach the server.");
      } finally {
        bump(-1);
      }
    },
    [ref, value, setValue, onError, bump],
  );

  const onPaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      if (e.clipboardData.files.length === 0) return;
      e.preventDefault();
      void addImage(e.clipboardData.files);
    },
    [addImage],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLTextAreaElement>) => {
      if (e.dataTransfer.files.length === 0) return;
      e.preventDefault();
      void addImage(e.dataTransfer.files);
    },
    [addImage],
  );

  const onDragOver = useCallback((e: DragEvent<HTMLTextAreaElement>) => e.preventDefault(), []);

  return { onPaste, onDrop, onDragOver, uploading: pending > 0 };
}
