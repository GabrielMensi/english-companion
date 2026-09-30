"use client";

import { useEffect, useRef } from "react";

/** Shown in the UI; matches {@link isShortcut}. */
export const PUSH_TO_TALK_KEYS = "Ctrl+Space";

/** A press shorter than this is a tap: it toggles instead of holding. */
const TAP_MS = 350;

function isShortcut(e: KeyboardEvent) {
  return e.code === "Space" && e.ctrlKey && !e.altKey && !e.metaKey;
}

/**
 * Push-to-talk on the whole page: hold Ctrl+Space to talk and release to stop.
 * A quick tap starts recording hands-free, and the next tap stops it.
 */
export function usePushToTalk({
  enabled,
  recording,
  onStart,
  onStop,
}: {
  enabled: boolean;
  recording: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  // The listeners are attached once; they read the latest props from here.
  const latest = useRef({ enabled, recording, onStart, onStop });
  useEffect(() => {
    latest.current = { enabled, recording, onStart, onStop };
  });

  useEffect(() => {
    let pressedAt: number | null = null;
    /** Whether this press started the recording (vs. stopping a tapped one). */
    let startedByPress = false;

    function onKeyDown(e: KeyboardEvent) {
      if (!isShortcut(e)) return;
      e.preventDefault();
      if (e.repeat || pressedAt !== null || !latest.current.enabled) return;
      pressedAt = Date.now();
      startedByPress = !latest.current.recording;
      if (startedByPress) latest.current.onStart();
      else latest.current.onStop();
    }

    function onKeyUp(e: KeyboardEvent) {
      if (pressedAt === null || (e.code !== "Space" && e.key !== "Control")) return;
      const held = Date.now() - pressedAt;
      pressedAt = null;
      // Releasing after holding stops; after a tap, keep recording until the next tap.
      if (startedByPress && held >= TAP_MS) latest.current.onStop();
    }

    // Switching windows while holding would never deliver the keyup.
    function onBlur() {
      if (pressedAt !== null && startedByPress) latest.current.onStop();
      pressedAt = null;
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}
