import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ChatView } from "@/components/chat/chat-view";
import { availableModels, hasConfiguredProvider, resolveTranscriptionModel } from "@/lib/ai/providers";
import { requirePageUser } from "@/lib/auth/session";
import { getMessages, getSession } from "@/lib/chat";
import { answerTemplate } from "@/lib/exercise-set";
import { getPractice, pendingSetSize } from "@/lib/practice";
import { getSettings } from "@/lib/settings";
import { getStoredFeedback } from "@/lib/topic-review";

export default async function ChatPage({ params }: PageProps<"/chat/[id]">) {
  await connection();
  const { id } = await params;
  const { userId } = await requirePageUser(`/chat/${id}`);
  const session = getSession(userId, id);
  if (!session) notFound();

  const settings = getSettings(userId);
  const setSize = pendingSetSize(userId, session.id);
  const practice = getPractice(userId, session.id);

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
      initialMessages={getMessages(userId, session.id)}
      models={availableModels(userId, settings)}
      selectedProvider={settings.provider}
      hasModel={hasConfiguredProvider(userId)}
      canDictate={resolveTranscriptionModel(userId) !== null}
      answerTemplate={setSize ? answerTemplate(setSize) : null}
      topicTools={
        practice?.kind === "topic"
          ? { tense: practice.tense ?? null, feedback: getStoredFeedback(userId, session.id) }
          : null
      }
    />
  );
}
