"use client";

import { useCallback, useState, type DragEvent, type ClipboardEvent, type RefObject } from "react";
import { insertAtCursor } from "@/lib/view/insert-at-cursor";

/**
 * Paste or drop an image into a markdown textarea.
 *
 * The image is copied into the data repo by `POST /api/assets` and linked by
 * its relative path, so the text keeps working in a plain markdown editor, on
 * another machine, and after the original file is moved or deleted. Two
 * editors want this — a note body and a charter's Why, whose picture is what
 * the core card of a map shows — so the behaviour lives here once rather than
 * being copied into the second one.
 */
export function useImagePaste(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  setValue: (next: string) => void,
  onError?: (message: string | null) => void,
) {
  const [uploading, setUploading] = useState(false);

  const addImage = useCallback(
    async (files: FileList | File[] | null) => {
      const image = [...(files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!image) return;
      const el = ref.current;
      // Read the caret before the await: focus can move while the upload runs.
      const start = el ? el.selectionStart : value.length;
      const end = el ? el.selectionEnd : value.length;
      setUploading(true);
      onError?.(null);
      try {
        const form = new FormData();
        form.append("file", image);
        const res = await fetch("/api/assets", { method: "POST", body: form });
        const out = (await res.json().catch(() => ({}))) as { ref?: string; error?: string };
        if (!res.ok || !out.ref) {
          onError?.(out.error ?? "Could not add that image.");
          return;
        }
        const next = insertAtCursor(value, start, end, `![](${out.ref})`);
        setValue(next.text);
        requestAnimationFrame(() => {
          const node = ref.current;
          if (!node) return;
          node.focus();
          node.setSelectionRange(next.cursor, next.cursor);
        });
      } catch {
        onError?.("Could not reach the server.");
      } finally {
        setUploading(false);
      }
    },
    [ref, value, setValue, onError],
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

  return { onPaste, onDrop, onDragOver, uploading };
}
