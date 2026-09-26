import { NewChatButton } from "@/components/sidebar/new-chat-button";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-8">
      <div className="max-w-xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Let&apos;s practice English 👋</h1>
          <p className="text-muted-foreground">
            Escribí en inglés y la IA te devuelve el mensaje corregido, con cada error marcado y explicado.
            Tus errores se guardan para que veas en el dashboard dónde estás flojo.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 rounded-lg border p-4">
            <h2 className="font-medium">Corrección</h2>
            <p className="text-sm text-muted-foreground">
              Solo corrige. Ideal para escribir prompts o mensajes y después usarlos en otro lado.
            </p>
            <NewChatButton mode="correction" label="Empezar" variant="outline" />
          </div>
          <div className="space-y-2 rounded-lg border p-4">
            <h2 className="font-medium">Conversación</h2>
            <p className="text-sm text-muted-foreground">
              Corrige y además te responde, para practicar charlando sobre cualquier tema.
            </p>
            <NewChatButton mode="conversation" label="Empezar" variant="outline" />
          </div>
        </div>

        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>
            💡 ¿No sabés cómo se dice algo? Escribilo en español entre corchetes:{" "}
            <code className="rounded bg-muted px-1">I want to [aprovechar] this moment</code>
          </li>
          <li>💡 Los typos se marcan, pero no cuentan como errores en las estadísticas.</li>
        </ul>
      </div>
    </div>
  );
}
