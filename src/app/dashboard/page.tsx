import Link from "next/link";
import { connection } from "next/server";
import { CategoryChart } from "@/components/dashboard/category-chart";
import { CategoryTable } from "@/components/dashboard/category-table";
import { StatTiles } from "@/components/dashboard/stat-tiles";
import { TimelineChart } from "@/components/dashboard/timeline-chart";
import { TopMistakes } from "@/components/dashboard/top-mistakes";
import { NewChatButton } from "@/components/sidebar/new-chat-button";
import { getDashboardData, RANGES, type RangeKey } from "@/lib/stats";
import { cn } from "@/lib/utils";

const RANGE_LABELS: Record<RangeKey, string> = { "7": "7 días", "30": "30 días", "90": "90 días", all: "Todo" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  await connection();
  const { range: rawRange } = await searchParams;
  const range: RangeKey = typeof rawRange === "string" && rawRange in RANGES ? (rawRange as RangeKey) : "30";
  const { stats, vocabulary, countTypos } = getDashboardData(range);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <p className="text-muted-foreground">
              Dónde estás fuerte, dónde flojo y qué conviene practicar.
              {!countTypos && " Los typos no se cuentan como errores."}
            </p>
          </div>
          <nav className="flex rounded-lg border p-0.5" aria-label="Período">
            {(Object.keys(RANGES) as RangeKey[]).map((key) => (
              <Link
                key={key}
                href={`/dashboard?range=${key}`}
                className={cn(
                  "rounded-md px-3 py-1 text-sm text-muted-foreground hover:text-foreground",
                  key === range && "bg-muted font-medium text-foreground",
                )}
              >
                {RANGE_LABELS[key]}
              </Link>
            ))}
          </nav>
        </div>

        {stats.totals.messages === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16 text-center">
            <p className="text-muted-foreground">Todavía no hay mensajes en este período.</p>
            <NewChatButton label="Escribir algo" />
          </div>
        ) : (
          <>
            <StatTiles totals={stats.totals} />

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Áreas a trabajar" subtitle="Errores por categoría, según gravedad">
                <CategoryChart categories={stats.categories.filter((c) => c.count > 0)} />
              </Panel>
              <Panel title="Evolución" subtitle="Errores cada 100 palabras">
                <TimelineChart data={stats.timeline} />
              </Panel>
            </div>

            <Panel
              title="Por categoría"
              subtitle="Tendencia comparada con el período anterior de igual duración"
            >
              <CategoryTable categories={stats.categories} />
            </Panel>

            <Panel title="Errores más frecuentes" subtitle="Con el ejemplo más reciente">
              <TopMistakes mistakes={stats.topMistakes} />
            </Panel>

            {vocabulary.length > 0 && (
              <Panel title="Vocabulario buscado" subtitle="Lo que escribiste entre [corchetes]">
                <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                  {vocabulary.map((v) => (
                    <li key={v.id}>
                      <span className="text-muted-foreground">{v.spanish}</span> →{" "}
                      <span className="font-medium">{v.english.join(" / ")}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h2 className="font-medium">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
