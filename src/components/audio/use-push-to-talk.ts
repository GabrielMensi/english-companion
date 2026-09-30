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
  keyWindow,
}: {
  enabled: boolean;
  recording: boolean;
  onStart: () => void;
  onStop: () => void;
  /** Another window to listen to as well (keys in the floating window don't reach this one). */
  keyWindow?: Window | null;
}) {
  // The listeners are only reattached when the windows change; they read the latest props from here.
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

    const targets = [window, ...(keyWindow ? [keyWindow] : [])];
    targets.forEach((t) => {
      t.addEventListener("keydown", onKeyDown);
      t.addEventListener("keyup", onKeyUp);
      t.addEventListener("blur", onBlur);
    });
    return () =>
      targets.forEach((t) => {
        t.removeEventListener("keydown", onKeyDown);
        t.removeEventListener("keyup", onKeyUp);
        t.removeEventListener("blur", onBlur);
      });
  }, [keyWindow]);
}
