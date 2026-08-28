import type { CSSProperties, ReactNode } from "react";
import { dashOf } from "@/lib/ui/momentum";

export function Mono({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={`font-mono tracking-[0.12em] ${className}`} style={style}>
      {children}
    </span>
  );
}

export function Rule({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-2.5">
      <Mono className="text-[9.5px] tracking-[0.16em] text-faint">{label}</Mono>
      <div className="h-px flex-1 bg-edge" />
      {action}
    </div>
  );
}

export function Panel({
  children,
  className = "",
  dashed = false,
  accent,
}: {
  children: ReactNode;
  className?: string;
  dashed?: boolean;
  accent?: string;
}) {
  return (
    <div
      className={`rounded-[18px] border ${
        dashed ? "border-dashed border-edge" : "border-edge bg-surf"
      } ${className}`}
      style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}
    >
      {children}
    </div>
  );
}

export function Ring({
  pct,
  size = 46,
  color,
  width = 12,
}: {
  pct: number;
  size?: number;
  color: string;
  width?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className="shrink-0 -rotate-90"
      aria-hidden
    >
      <circle cx="50" cy="50" r="40" fill="none" stroke="var(--color-ring-track)" strokeWidth={width} />
      <circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={dashOf(pct)}
      />
    </svg>
  );
}

export function Bar({
  pct,
  color,
  height = 8,
}: {
  pct: number;
  color: string;
  height?: number;
}) {
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-soft"
      style={{ height }}
      role="presentation"
    >
      <div
        className="rounded-full"
        style={{ height, background: color, width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

export function Tick({
  done,
  color,
  size = 16,
}: {
  done: boolean;
  color: string;
  size?: number;
}) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[5px] border-[1.4px]"
      style={{
        width: size,
        height: size,
        borderColor: done ? color : "var(--color-faint)",
        background: done ? color : "transparent",
      }}
    >
      <svg
        width={size * 0.56}
        height={size * 0.56}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#ffffff"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: done ? 1 : 0 }}
        aria-hidden
      >
        <path d="M4.5 12.5l5 5 10-11" />
      </svg>
    </span>
  );
}

export function AssistantNote({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl bg-soft px-[17px] py-[15px] ${className}`}>
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[7px] bg-quick-tint font-mono text-[9.5px] text-quick-ink">
        M
      </span>
      <span className="text-[13.5px] leading-[1.55] text-dim">{children}</span>
    </div>
  );
}

export function StatChip({
  n,
  label,
  color = "var(--color-ink)",
}: {
  n: ReactNode;
  label: string;
  color?: string;
}) {
  return (
    <div className="min-w-0 rounded-[18px] border border-edge bg-surf p-[17px]">
      <div className="text-[25px] font-bold leading-none tracking-[-0.03em]" style={{ color }}>
        {n}
      </div>
      <Mono className="mt-2 block text-[9px] tracking-[0.1em] text-faint">{label}</Mono>
    </div>
  );
}

export function LaneTag({
  label,
  ink,
  tint,
}: {
  label: string;
  ink: string;
  tint: string;
}) {
  return (
    <Mono
      className="rounded-[5px] px-[7px] py-[3px] text-[8.5px] tracking-[0.08em]"
      style={{ color: ink, background: tint }}
    >
      {label.toUpperCase()}
    </Mono>
  );
}

export function PageTitle({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-baseline gap-3">
      <h1 className="m-0 text-2xl font-semibold tracking-[-0.03em]">{title}</h1>
      {meta ? <Mono className="text-[10px] tracking-[0.1em] text-faint">{meta}</Mono> : null}
      <div className="flex-1" />
      {children}
    </div>
  );
}

export function GhostButton({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-[7px] rounded-[11px] border border-edge bg-surf px-[14px] py-[9px] text-[12.5px] font-medium transition-colors hover:border-ink ${className}`}
    >
      {children}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-0.5 py-1.5 text-[12.5px] text-faint">{children}</div>;
}
