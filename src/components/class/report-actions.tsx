"use client";

import { Download, Printer } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";

/** Print (or save as PDF), copy as Markdown or download the report. Hidden when printing. */
export function ReportActions({ markdown, query }: { markdown: string; query: string }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer /> Print / save as PDF
      </Button>
      <CopyButton text={markdown} label="Copy as Markdown" />
      <Button asChild variant="ghost" size="sm">
        <a href={`/api/class/report?${query}`} download>
          <Download /> Download .md
        </a>
      </Button>
    </div>
  );
}
