"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/** Default size of the floating window; the browser remembers where the user moves it. */
const SIZE = { width: 400, height: 560 };

/**
 * An always-on-top window (Document Picture-in-Picture) the page can render into with a portal.
 * It shares the page's JS realm, so whatever is rendered there keeps its state and handlers.
 */
export function usePipWindow() {
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => "documentPictureInPicture" in window,
    () => false,
  );
  const [pipWindow, setPipWindow] = useState<Window | null>(null);

  /**
   * Opens the window, or focuses it if it's already open (there's only one per tab).
   * Needs a user gesture, except from the media session's "enterpictureinpicture" handler.
   * `auto`: opened on tab switch, so it closes itself when the user comes back to the tab.
   */
  const open = useCallback(async ({ auto = false }: { auto?: boolean } = {}) => {
    const api = window.documentPictureInPicture;
    if (!api) return;
    if (api.window) {
      api.window.focus();
      return;
    }

    const win = await api.requestWindow(SIZE);
    const stopSync = syncDocument(win.document);
    const closeOnReturn = () => {
      if (document.visibilityState === "visible") win.close();
    };
    if (auto) document.addEventListener("visibilitychange", closeOnReturn);
    win.addEventListener(
      "pagehide",
      () => {
        stopSync();
        document.removeEventListener("visibilitychange", closeOnReturn);
        setPipWindow(null);
      },
      { once: true },
    );
    setPipWindow(win);
  }, []);

  const close = useCallback(() => window.documentPictureInPicture?.window?.close(), []);

  // What's rendered in the window belongs to this page: close it when leaving (e.g. switching chats).
  useEffect(() => close, [close]);

  return { supported, window: pipWindow, open, close };
}

function noopSubscribe() {
  return () => {};
}

/**
 * The PiP document starts empty: copy the page's stylesheets and <html> attributes (font variables,
 * the `dark` class from next-themes) and keep them in sync, since theme changes and HMR update them.
 */
function syncDocument(doc: Document) {
  doc.title = document.title;
  doc.body.className = "h-full overflow-hidden bg-background text-foreground";

  const clones = new Map<Element, HTMLElement>();
  function syncStyles() {
    const current = new Set(document.head.querySelectorAll('style, link[rel="stylesheet"]'));
    for (const [original, clone] of clones) {
      if (!current.has(original)) {
        clone.remove();
        clones.delete(original);
      }
    }
    for (const original of current) {
      const clone = clones.get(original);
      if (!clone) {
        const copy = original.cloneNode(true) as HTMLElement;
        doc.head.append(copy);
        clones.set(original, copy);
      } else if (original instanceof HTMLStyleElement && clone.textContent !== original.textContent) {
        clone.textContent = original.textContent;
      } else if (original instanceof HTMLLinkElement && (clone as HTMLLinkElement).href !== original.href) {
        (clone as HTMLLinkElement).href = original.href;
      }
    }
  }

  function syncRoot() {
    const root = document.documentElement;
    doc.documentElement.className = root.className;
    doc.documentElement.setAttribute("style", root.getAttribute("style") ?? "");
  }

  syncStyles();
  syncRoot();
  const styles = new MutationObserver(syncStyles);
  styles.observe(document.head, { childList: true, subtree: true, characterData: true });
  const root = new MutationObserver(syncRoot);
  root.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });

  return () => {
    styles.disconnect();
    root.disconnect();
  };
}
