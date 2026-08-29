"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { NavCharter } from "./context";

const NAV = [
  { href: "/", label: "Focus", d: "M12 4v3M12 17v3M4 12h3M17 12h3" },
  { href: "/board", label: "Board", d: "M4 5h5v14H4zM11 5h4v9h-4zM17 5h3v6h-3z" },
  { href: "/branches", label: "Branches", d: "M6 6v9a3 3 0 003 3h9M9 10h9" },
  { href: "/insights", label: "Dashboard", d: "M5 19V9M10 19V5M15 19v-7M20 19v-4" },
  { href: "/review", label: "Review", d: "M5 4h14v16H5zM9 9h6M9 13h6M9 17h3" },
  {
    href: "/knowledge",
    label: "Knowledge",
    d: "M4 5h6a2 2 0 012 2v12a2 2 0 00-2-2H4zM20 5h-6a2 2 0 00-2 2v12a2 2 0 012-2h6z",
  },
  { href: "/done", label: "Done", d: "M5 12.5l4.5 4.5L19 7.5" },
  { href: "/journal", label: "Activity", d: "M6 4h12v16H6zM9 8h6M9 12h6M9 16h3" },
  { href: "/archive", label: "Archive", d: "M4 7h16v3H4zM6 10v9h12v-9M10 14h4" },
  { href: "/agents", label: "Agents", d: "M12 3v3M8 9h8v6H8zM6 12H3M21 12h-3M9 18v3M15 18v3" },
  { href: "/settings", label: "Settings", d: "M12 9a3 3 0 100 6 3 3 0 000-6M4 12h2M18 12h2M12 4v2M12 18v2" },
];

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-faint)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden
    >
      <path d={open ? "M6 9l6 6 6-6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

export default function Sidebar({
  collapsed,
  lockCollapsed = false,
  onToggle,
  charters,
}: {
  collapsed: boolean;
  lockCollapsed?: boolean;
  onToggle: () => void;
  charters: NavCharter[];
}) {
  const pathname = usePathname();
  const [lifeOpen, setLifeOpen] = useState(true);
  const [projOpen, setProjOpen] = useState(true);

  const areas = charters.filter((c) => c.type === "area");
  const projects = charters.filter((c) => c.type === "project");
  const labelClass = collapsed ? "hidden" : "block";

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside
      className="flex shrink-0 flex-col overflow-hidden border-r border-edge2 bg-soft pt-5 pb-4 transition-[width] duration-200"
      style={{ width: collapsed ? 62 : 212 }}
    >
      <div className="flex items-center gap-[11px] px-4 pb-[22px]">
        <svg width="25" height="25" viewBox="0 0 24 24" className="shrink-0" aria-hidden>
          <rect x="2" y="13" width="5" height="9" rx="1.8" fill="var(--color-some)" />
          <rect x="9.5" y="8" width="5" height="14" rx="1.8" fill="var(--color-deep)" />
          <rect x="17" y="2" width="5" height="20" rx="1.8" fill="var(--color-quick)" />
        </svg>
        <span
          className={`${labelClass} whitespace-nowrap text-[16.5px] font-semibold tracking-[-0.02em]`}
        >
          Planner
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <nav className="flex shrink-0 flex-col gap-0.5 px-2">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-[10px] px-2.5 py-[9px] transition-colors hover:bg-surf ${
                  active ? "bg-surf text-ink" : "text-dim"
                }`}
                title={collapsed ? item.label : undefined}
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                  aria-hidden
                >
                  <path d={item.d} />
                </svg>
                <span className={`${labelClass} whitespace-nowrap text-[13.5px] font-medium`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="h-3.5" />

        <div className="shrink-0 px-2">
          <div className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 transition-colors hover:bg-surf">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-sky)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
              aria-hidden
            >
              <path d="M12 20s-7-4.4-7-9.3A4.1 4.1 0 0112 8a4.1 4.1 0 017 2.7c0 4.9-7 9.3-7 9.3z" />
            </svg>
            <Link
              href="/life"
              className={`${labelClass} whitespace-nowrap text-[13px] font-semibold ${
                isActive("/life") ? "text-ink" : "text-dim"
              }`}
            >
              Life
            </Link>
            <div className="flex-1" />
            {!collapsed && (
              <button type="button" onClick={() => setLifeOpen((v) => !v)} aria-label="Toggle life">
                <Chevron open={lifeOpen} />
              </button>
            )}
          </div>

          {lifeOpen && !collapsed && (
            <div className="mb-1.5 flex flex-col gap-px pl-3.5">
              {areas.map((a) => {
                const active = pathname === `/areas/${a.slug}` || pathname.startsWith(`/areas/${a.slug}/`);
                return (
                  <Link
                    key={a.key}
                    href={`/areas/${a.slug}`}
                    className={`flex items-center gap-[11px] rounded-[9px] px-2.5 py-[7px] transition-colors hover:bg-surf ${
                      active ? "bg-surf" : ""
                    }`}
                  >
                    <span
                      className="h-[7px] w-[7px] shrink-0 rounded-full"
                      style={{ background: a.color }}
                    />
                    <span
                      className={`truncate text-[12.5px] ${active ? "text-ink" : "text-dim"}`}
                    >
                      {a.name}
                    </span>
                  </Link>
                );
              })}
              {areas.length === 0 && (
                <span className="px-2.5 py-[7px] text-[12px] text-faint">No areas yet</span>
              )}
              <Link
                href="/daily"
                className={`flex items-center gap-[11px] rounded-[9px] px-2.5 py-[7px] transition-colors hover:bg-surf ${
                  isActive("/daily") ? "bg-surf" : ""
                }`}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-faint)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                  aria-hidden
                >
                  <path d="M12 20s-7-4.4-7-9.3A4.1 4.1 0 0112 8a4.1 4.1 0 017 2.7c0 4.9-7 9.3-7 9.3z" />
                </svg>
                <span className={`text-[12.5px] ${isActive("/daily") ? "text-ink" : "text-dim"}`}>
                  Daily
                </span>
              </Link>
              <Link
                href="/calendar"
                className={`flex items-center gap-[11px] rounded-[9px] px-2.5 py-[7px] transition-colors hover:bg-surf ${
                  isActive("/calendar") ? "bg-surf" : ""
                }`}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-faint)"
                  strokeWidth="2"
                  className="shrink-0"
                  aria-hidden
                >
                  <rect x="4" y="5" width="16" height="16" rx="2" />
                  <path d="M4 10h16M9 3v3M15 3v3" />
                </svg>
                <span
                  className={`text-[12.5px] ${isActive("/calendar") ? "text-ink" : "text-dim"}`}
                >
                  Calendar
                </span>
              </Link>
              <Link
                href="/targets"
                className={`flex items-center gap-[11px] rounded-[9px] px-2.5 py-[7px] transition-colors hover:bg-surf ${
                  isActive("/targets") ? "bg-surf" : ""
                }`}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-faint)"
                  strokeWidth="2"
                  className="shrink-0"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="8" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span className={`text-[12.5px] ${isActive("/targets") ? "text-ink" : "text-dim"}`}>
                  Targets
                </span>
              </Link>
            </div>
          )}

          <div className="mt-1.5 flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 transition-colors hover:bg-surf">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-deep)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
              aria-hidden
            >
              <path d="M4 7h6l2 2h8v10H4z" />
            </svg>
            <Link
              href="/projects"
              className={`${labelClass} whitespace-nowrap text-[13px] font-semibold ${
                isActive("/projects") ? "text-ink" : "text-dim"
              }`}
            >
              Projects
            </Link>
            <div className="flex-1" />
            {!collapsed && (
              <button
                type="button"
                onClick={() => setProjOpen((v) => !v)}
                aria-label="Toggle projects"
              >
                <Chevron open={projOpen} />
              </button>
            )}
          </div>

          {projOpen && !collapsed && (
            <div className="mb-1.5 flex flex-col gap-px pl-3.5">
              {projects.map((p) => {
                const active =
                  pathname === `/projects/${p.slug}` || pathname.startsWith(`/projects/${p.slug}/`);
                return (
                  <Link
                    key={p.key}
                    href={`/projects/${p.slug}`}
                    className={`flex items-center gap-[11px] rounded-[9px] px-2.5 py-[7px] transition-colors hover:bg-surf ${
                      active ? "bg-surf" : ""
                    }`}
                  >
                    <span
                      className="h-[7px] w-[7px] shrink-0 rounded-[2px]"
                      style={{ background: p.color }}
                    />
                    <span
                      className={`truncate text-[12.5px] ${active ? "text-ink" : "text-dim"}`}
                    >
                      {p.name}
                    </span>
                    <div className="flex-1" />
                    <span className="font-mono text-[9.5px] text-faint">{p.open}</span>
                  </Link>
                );
              })}
              {projects.length === 0 && (
                <span className="px-2.5 py-[7px] text-[12px] text-faint">No projects yet</span>
              )}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onToggle}
        hidden={lockCollapsed}
        className="mx-2 mt-2 flex shrink-0 items-center gap-3 rounded-[10px] px-2.5 py-[9px] text-faint transition-colors hover:bg-surf hover:text-ink"
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
          aria-hidden
        >
          <path d="M4 5h16v14H4zM10 5v14" />
        </svg>
        <span className={`${labelClass} whitespace-nowrap text-[13.5px]`}>Collapse</span>
      </button>
    </aside>
  );
}
