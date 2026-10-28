/**
 * SPIKE (#135): the phoneme model in a browser tab (WASM), measured in headless Chrome. A small
 * local server hands the page transformers.js, its ONNX Runtime WASM files, the model files from
 * data/models (run the app once, or the phonemes script, so they are there) and a clip; the page
 * loads the model, runs a few inferences with 1 and N threads, and posts the numbers back.
 * Everything is served from localhost, so the download time is NOT a real network time: the file
 * sizes are what to multiply by a bandwidth. WebGPU is not measured (headless Chrome has none here).
 *
 *   pnpm tsx scripts/spike/pron-audio/browser.mts [--chrome=/usr/bin/google-chrome] [--clip=data/pron-audio-spike/af_heart--develop-ok.wav]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const option = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const chrome = option("chrome") ?? "/usr/bin/google-chrome";
const clip = path.resolve(option("clip") ?? "data/pron-audio-spike/af_heart--develop-ok.wav");
const modelsDir = path.resolve("data/models");
const dist = path.resolve("node_modules/@huggingface/transformers/dist");
const threads = Math.min(4, os.cpus().length);

const PAGE = `<!doctype html><meta charset="utf-8"><script type="module">
import { env, AutoModelForCTC, AutoProcessor } from "/lib/transformers.min.js";
const MODEL = "onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX";
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "/models/";
env.backends.onnx.wasm.wasmPaths = "/lib/";
const out = { crossOriginIsolated, cores: navigator.hardwareConcurrency, userAgent: navigator.userAgent, runs: [] };
const post = (body) => fetch("/report", { method: "POST", body: JSON.stringify(body) });
try {
  const wav = new DataView(await (await fetch("/clip.wav")).arrayBuffer());
  const n = (wav.byteLength - 44) / 2;
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = wav.getInt16(44 + i * 2, true) / 0x8000;
  out.clipSeconds = n / 16000;
  const t0 = performance.now();
  const processor = await AutoProcessor.from_pretrained(MODEL);
  out.processorMs = Math.round(performance.now() - t0);
  for (const numThreads of [1, ${threads}]) {
    env.backends.onnx.wasm.numThreads = numThreads;
    const t1 = performance.now();
    const model = await AutoModelForCTC.from_pretrained(MODEL, { dtype: "q8", device: "wasm" });
    const loadMs = Math.round(performance.now() - t1);
    const times = [];
    for (let i = 0; i < 4; i++) {
      const inputs = await processor(samples);
      const t = performance.now();
      await model(inputs);
      times.push(Math.round(performance.now() - t));
    }
    out.runs.push({ numThreads, loadMs, firstInferenceMs: times[0], laterInferenceMs: times.slice(1), heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6) });
    await model.dispose?.();
  }
} catch (e) { out.error = String(e && e.stack || e); }
await post(out);
</script>`;

const TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".onnx": "application/octet-stream",
  ".wav": "audio/wav",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  console.log(`${req.method} ${url.pathname}`);
  const headers = {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  if (req.method === "POST" && url.pathname === "/report") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.writeHead(204).end();
      console.log(JSON.stringify(JSON.parse(body), null, 2));
      const files = ["onnx/model_quantized.onnx", "config.json", "preprocessor_config.json"].map(
        (f) => fs.statSync(path.join(modelsDir, "onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX", f)).size,
      );
      const wasm = fs.statSync(path.join(dist, "ort-wasm-simd-threaded.jsep.wasm")).size;
      console.log(
        `Download: model ${(files[0] / 1e6).toFixed(0)} MB (+${files[1] + files[2]} B of config), ONNX Runtime WASM ${(wasm / 1e6).toFixed(1)} MB, transformers.js ${(fs.statSync(path.join(dist, "transformers.min.js")).size / 1e3).toFixed(0)} kB min`,
      );
      server.close();
      chromeProcess.kill();
    });
    return;
  }
  let file: string | null = null;
  if (url.pathname === "/") {
    res.writeHead(200, { ...headers, "Content-Type": "text/html" }).end(PAGE);
    return;
  }
  if (url.pathname === "/clip.wav") file = clip;
  else if (url.pathname.startsWith("/lib/")) file = path.join(dist, path.basename(url.pathname));
  else if (url.pathname.startsWith("/models/"))
    file = path.join(modelsDir, decodeURIComponent(url.pathname.slice("/models/".length)).replace(/\.\./g, ""));
  if (!file || !fs.existsSync(file)) {
    res.writeHead(404, headers).end();
    return;
  }
  res.writeHead(200, {
    ...headers,
    "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
    "Content-Length": fs.statSync(file).size,
  });
  fs.createReadStream(file).pipe(res);
});

await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address() as { port: number };
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pron-browser-"));
const chromeProcess = spawn(
  chrome,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--enable-logging=stderr",
    "--v=0",
    `--user-data-dir=${profile}`,
    `http://127.0.0.1:${port}/`,
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
chromeProcess.stderr?.on("data", (d) => {
  if (/CONSOLE|ERROR/.test(String(d))) console.log(String(d).trim().slice(0, 400));
});
setTimeout(() => {
  console.error("Timed out after 10 minutes.");
  chromeProcess.kill();
  process.exit(1);
}, 600_000).unref();
chromeProcess.on("exit", () => fs.rmSync(profile, { recursive: true, force: true }));
