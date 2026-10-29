"use client";

import { createContext, useContext } from "react";
import { toast } from "sonner";
import type { Notify } from "@/components/chat/composer";

interface FloatingWindow {
  /** Where Radix popups (dialogs, selects) render: the floating window's body, not the hidden tab's. */
  container: HTMLElement | null;
  notify: Notify;
}

const toastNotify: Notify = (kind, message) => toast[kind](message);

const FloatingWindowContext = createContext<FloatingWindow>({ container: null, notify: toastNotify });

/** Wraps what is rendered in the floating window, so shared components open their popups and messages there. */
export const FloatingWindowProvider = FloatingWindowContext.Provider;

/**
 * The element Radix portals should render into; null (the default) is the page's own body.
 * Radix still uses the tab's document for a few things while a dialog is open here: its scroll lock
 * (the tab, not this window, is locked) and focus guards. Harmless, and removed on close. Its focus
 * trap and the Select's `item-aligned` position don't work across documents: see `DialogContent` and `SelectContent`.
 */
export function usePortalContainer(): HTMLElement | null {
  return useContext(FloatingWindowContext).container;
}

/** Shows a message where the user is looking: a toast in the tab, an inline notice in the floating window. */
export function useNotify(): Notify {
  return useContext(FloatingWindowContext).notify;
}
