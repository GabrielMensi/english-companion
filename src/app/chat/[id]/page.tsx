import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ChatView } from "@/components/chat/chat-view";
import { availableModels, resolveTranscriptionModel } from "@/lib/ai/providers";
import { getMessages, getSession } from "@/lib/chat";
import { getSettings } from "@/lib/settings";

export default async function ChatPage({ params }: PageProps<"/chat/[id]">) {
  await connection();
  const { id } = await params;
  const session = getSession(id);
  if (!session) notFound();

  const settings = getSettings();

  return (
    <ChatView
      // Remount when switching chats so local state doesn't leak between sessions.
      key={session.id}
      session={{ id: session.id, title: session.title, mode: session.mode }}
      initialMessages={getMessages(session.id)}
      models={availableModels(settings)}
      selectedProvider={settings.provider}
      canDictate={resolveTranscriptionModel() !== null}
    />
  );
}
