import { connection } from "next/server";
import { Page, PageHeader } from "@/components/layout/page";
import { SettingsForm } from "@/components/settings/settings-form";
import { VoiceSettings } from "@/components/settings/voice-settings";
import { providerStatus } from "@/lib/ai/providers";
import { getSettings } from "@/lib/settings";
import { requirePageUser } from "@/lib/auth/session";

export default async function SettingsPage() {
  await connection();
  const { userId } = await requirePageUser("/settings");
  const settings = getSettings(userId);
  return (
    <Page width="md">
      <PageHeader title="Settings" description="Choose which AI models correct your messages and in what order." />
      <SettingsForm initialSettings={settings} initialProviders={providerStatus()} />
      <VoiceSettings />
    </Page>
  );
}
