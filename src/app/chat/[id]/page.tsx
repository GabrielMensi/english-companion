import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ChatView } from "@/components/chat/chat-view";
import { availableModels, hasConfiguredProvider, resolveTranscriptionModel } from "@/lib/ai/providers";
import { getMessages, getSession } from "@/lib/chat";
import { answerTemplate } from "@/lib/exercise-set";
import { getPractice, pendingSetSize } from "@/lib/practice";
import { getSettings } from "@/lib/settings";

export default async function ChatPage({ params }: PageProps<"/chat/[id]">) {
  await connection();
  const { id } = await params;
  const session = getSession(id);
  if (!session) notFound();

  const settings = getSettings();
  const setSize = pendingSetSize(session.id);
  const practice = getPractice(session.id);

  return (
    <ChatView
      // Remount when switching chats so local state doesn't leak between sessions.
      key={session.id}
      session={{
        id: session.id,
        title: session.title,
        mode: session.mode,
        topic: practice?.kind === "topic" ? practice.topic : null,
      }}
      initialMessages={getMessages(session.id)}
      models={availableModels(settings)}
      selectedProvider={settings.provider}
      hasModel={hasConfiguredProvider()}
      canDictate={resolveTranscriptionModel() !== null}
      answerTemplate={setSize ? answerTemplate(setSize) : null}
    />
  );
}
