import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Shell from "@/components/momentum/shell";
import type { NavCharter } from "@/components/momentum/context";
import { loadWorkspace } from "@/lib/view/workspace";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Planner",
  description: "Local-first planner: what to do next, and why.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let charters: NavCharter[] = [];
  try {
    const ws = await loadWorkspace();
    charters = ws.charters.map((c) => ({
      key: `${c.type}/${c.id}`,
      type: c.type,
      slug: c.id,
      name: c.name,
      color: c.color,
      open: c.open,
    }));
  } catch {
    charters = [];
  }

  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body>
        <Shell charters={charters}>{children}</Shell>
      </body>
    </html>
  );
}
