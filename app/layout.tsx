import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Planner",
  description: "Local-first planner: projects, areas, journal, insights.",
};

function todayLabel() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-full bg-neutral-950 text-neutral-200">
        <Nav />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-3">
            <span className="text-sm text-neutral-400">{todayLabel()}</span>
            <span className="text-sm text-neutral-500" aria-hidden />
          </header>
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
