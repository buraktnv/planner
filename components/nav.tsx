"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Today" },
  { href: "/projects", label: "Projects" },
  { href: "/areas", label: "Areas" },
  { href: "/journal", label: "Journal" },
  { href: "/insights", label: "Insights" },
  { href: "/chat", label: "Chat" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-neutral-800 bg-neutral-900 p-3">
      <div className="px-3 py-2 text-sm font-semibold tracking-tight text-emerald-400">
        Planner
      </div>
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-neutral-800 text-emerald-400"
                : "text-neutral-300 hover:bg-neutral-800/60 hover:text-neutral-100"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
