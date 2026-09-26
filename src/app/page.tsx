import { NewChatButton } from "@/components/sidebar/new-chat-button";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-8">
      <div className="max-w-xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Let&apos;s practice English 👋</h1>
          <p className="text-muted-foreground">
            Write in English and the AI gives you back the corrected message, with every mistake highlighted and explained.
            Your mistakes are saved so the dashboard can show you where you need practice.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 rounded-lg border p-4">
            <h2 className="font-medium">Correction</h2>
            <p className="text-sm text-muted-foreground">
              Corrections only. Great for writing prompts or messages to use somewhere else.
            </p>
            <NewChatButton mode="correction" label="Start" variant="outline" />
          </div>
          <div className="space-y-2 rounded-lg border p-4">
            <h2 className="font-medium">Conversation</h2>
            <p className="text-sm text-muted-foreground">
              Corrects you and also replies, so you can practice chatting about anything.
            </p>
            <NewChatButton mode="conversation" label="Start" variant="outline" />
          </div>
        </div>

        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>
            💡 Don’t know how to say something? Write it in Spanish between brackets:{" "}
            <code className="rounded bg-muted px-1">I want to [aprovechar] this moment</code>
          </li>
          <li>💡 Typos are highlighted, but they don’t count as mistakes in your stats.</li>
        </ul>
      </div>
    </div>
  );
}
