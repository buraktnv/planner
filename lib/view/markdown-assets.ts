/**
 * Where an image in a note body actually loads from.
 *
 * Notes store `assets/<name>.png` — a path relative to the data repo, so the
 * markdown stays true in any editor and survives being moved between machines.
 * The browser cannot read the data repo, so the reference is rewritten to the
 * route that serves it.
 *
 * Everything else returns null and renders nothing. `data:` in particular:
 * pasting a screenshot as a data URI would bury megabytes of base64 inside a
 * markdown file that is supposed to stay readable and diffable.
 */
const ASSET_REF = /^(?:\.\/|\/)?assets\/([A-Za-z0-9._-]+)$/;

export function rewriteAssetSrc(src: string | undefined): string | null {
  if (typeof src !== "string") return null;
  const trimmed = src.trim();
  if (trimmed === "") return null;

  const m = ASSET_REF.exec(trimmed);
  if (m) return `/api/assets/${m[1]}`;

  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  return null;
}
