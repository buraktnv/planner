"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings", label: "SOURCES" },
  { href: "/settings/agents", label: "AGENTS" },
  { href: "/settings/activity", label: "ACTIVITY" },
];

export default function SettingsTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-[26px] flex flex-wrap gap-[7px]">
      {TABS.map((t) => {
        const on = t.href === "/settings" ? pathname === "/settings" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-lg border px-2.5 py-[5px] font-mono text-[9px] tracking-[0.08em] transition-colors ${
              on ? "border-ink text-ink" : "border-edge text-faint hover:text-dim"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
