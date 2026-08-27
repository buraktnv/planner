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
    <div className="space-y-10">
      <section>
        <h1 className="text-2xl font-semibold text-neutral-100">Settings</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Provider profiles (no secrets are stored here — only env var names).
        </p>
      </section>

      <ProvidersManager initial={providers} envPresent={envPresent} />

      <AboutEditor initial={about} />
    </div>
  );
}
