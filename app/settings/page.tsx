import { getAbout } from "@/lib/core/store";
import { getProviders } from "@/lib/core/providers";
import ProvidersManager from "./providers-manager";
import AboutEditor from "./about-editor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [providers, about] = await Promise.all([getProviders(), getAbout()]);
  const envPresent: Record<string, boolean> = {};
  for (const p of providers.profiles) {
    envPresent[p.id] = p.apiKeyEnv ? process.env[p.apiKeyEnv] !== undefined : false;
  }

  return (
    <div className="mx-auto max-w-[800px] px-9 pt-[52px] pb-[90px]">
      <h1 className="m-0 mb-1.5 text-2xl font-semibold tracking-[-0.03em]">Settings</h1>
      <p className="m-0 mb-[26px] text-[13.5px] text-dim">
        Provider profiles and context. No secrets live here — only env var names.
      </p>

      <div className="flex flex-col gap-[30px]">
        <ProvidersManager initial={providers} envPresent={envPresent} />
        <AboutEditor initial={about} />
      </div>
    </div>
  );
}
