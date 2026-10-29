"use client";

import { useEffect } from "react";

import { preloadSpeech } from "@/components/audio/speech";

/**
 * Loads Kokoro in the background when the app opens, if it's the chosen engine, so the first ▶
 * doesn't wait for the model. It waits until the browser is idle, so the page loads first. The
 * model lives in a module-level worker, so it stays loaded across client-side navigation.
 */
export function SpeechPreloader() {
  useEffect(() => {
    if (typeof requestIdleCallback === "function") {
      const handle = requestIdleCallback(preloadSpeech, { timeout: 5000 });
      return () => cancelIdleCallback(handle);
    }
    const timer = setTimeout(preloadSpeech, 2000);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
