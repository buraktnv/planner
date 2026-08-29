import type { ReactNode } from "react";
import SettingsTabs from "@/components/momentum/settings-tabs";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[880px] px-9 pt-[52px] pb-[90px]">
      <h1 className="m-0 mb-[18px] text-2xl font-semibold tracking-[-0.03em]">Settings</h1>
      <SettingsTabs />
      {children}
    </div>
  );
}
