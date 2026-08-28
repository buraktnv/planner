"use client";

import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function Dialog({
  label,
  onClose,
  maxWidth = 520,
  paddingTop = 70,
  children,
}: {
  label: string;
  onClose: () => void;
  maxWidth?: number;
  paddingTop?: number;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    const node = panel.current;
    const returnTo = node && active && node.contains(active) ? null : active;
    const target =
      node?.querySelector<HTMLElement>("input,textarea,select") ??
      node?.querySelector<HTMLElement>(FOCUSABLE) ??
      node;
    target?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;
      const edge = e.shiftKey ? items[0] : items[items.length - 1];
      if (document.activeElement === edge) {
        e.preventDefault();
        (e.shiftKey ? items[items.length - 1] : items[0]).focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      returnTo?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(46,42,38,.28)] px-6"
      style={{ paddingTop, paddingBottom: paddingTop }}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="animate-pop w-full rounded-[22px] border border-edge bg-surf px-[26px] py-6 shadow-[0_20px_50px_rgba(46,42,38,.14)] outline-none"
        style={{ maxWidth }}
      >
        {children}
      </div>
    </div>
  );
}
