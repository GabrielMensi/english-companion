import { connection } from "next/server";
import { SettingsForm } from "@/components/settings/settings-form";
import { providerStatus } from "@/lib/ai/providers";
import { getSettings } from "@/lib/settings";

export default async function SettingsPage() {
  await connection();
  const settings = getSettings();
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-6 px-6 py-8">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-muted-foreground">Choose which AI models correct your messages and in what order.</p>
        </div>
        <SettingsForm initialSettings={settings} initialProviders={providerStatus(settings)} />
      </div>
    </div>
  );
}
