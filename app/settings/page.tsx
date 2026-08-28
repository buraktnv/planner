import { getAbout } from "@/lib/core/store";
import { apiKeyEnvOf, getProviders, PROVIDER_PRESETS } from "@/lib/core/providers";
import ProvidersManager from "./providers-manager";
import AboutEditor from "./about-editor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [providers, about] = await Promise.all([getProviders(), getAbout()]);

  const envNames = new Set<string>([
    PROVIDER_PRESETS.openrouter.apiKeyEnv,
    PROVIDER_PRESETS.deepseek.apiKeyEnv,
    "ANTHROPIC_API_KEY",
  ]);
  for (const p of providers.profiles) {
    const name = apiKeyEnvOf(p);
    if (name) envNames.add(name);
  }
  const envPresent: Record<string, boolean> = {};
  for (const name of envNames) {
    const value = process.env[name];
    envPresent[name] = value !== undefined && value !== "";
  }

  return (
    <div className="mx-auto max-w-[800px] px-9 pt-[52px] pb-[90px]">
      <h1 className="m-0 mb-1.5 text-2xl font-semibold tracking-[-0.03em]">Settings</h1>
      <p className="m-0 mb-[26px] text-[13.5px] text-dim">
        Sources, a model catalog and your favourites. No secrets live here — only env var names.
      </p>

      <div className="flex flex-col gap-[30px]">
        <ProvidersManager initial={providers} envPresent={envPresent} />
        <AboutEditor initial={about} />
      </div>
    </div>
  );
}
