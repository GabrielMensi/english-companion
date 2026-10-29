import { describe, expect, it } from "vitest";

import { readLines } from "./api";

function streamOf(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(chunks: string[]) {
  const lines: string[] = [];
  for await (const line of readLines(streamOf(chunks))) lines.push(line);
  return lines;
}

describe("readLines", () => {
  it("rebuilds lines cut across chunks and skips empty ones", async () => {
    expect(await collect(['{"a":', '1}\n{"b"', ":2}\n\n", '{"c":3}'])).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  });

  it("keeps multi-byte characters split between chunks", async () => {
    const bytes = new TextEncoder().encode('{"t":"está"}\n');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 10));
        controller.enqueue(bytes.slice(10));
        controller.close();
      },
    });
    const lines: string[] = [];
    for await (const line of readLines(stream)) lines.push(line);
    expect(lines).toEqual(['{"t":"está"}']);
  });
});
