import { createWithEqualityFn as create } from "zustand/traditional";

export const REFERENCE_DEFAULT_WIDTH = 320;
export const REFERENCE_MIN_WIDTH = 280;
export const REFERENCE_MAX_WIDTH_RESERVE = 200;

export function clampReferenceWidth(width: number): number {
  const max = Math.max(
    REFERENCE_MIN_WIDTH,
    (typeof window !== "undefined" ? window.innerWidth : 1600) -
      REFERENCE_MAX_WIDTH_RESERVE,
  );
  return Math.min(Math.max(width, REFERENCE_MIN_WIDTH), max);
}

export type ReferenceMode = "scratch" | "tab";

interface ReferenceStore {
  text: string;
  width: number;
  mode: ReferenceMode;
  linkedTabId: string | null;
  setText: (text: string) => void;
  setWidth: (width: number) => void;
  clear: () => void;
  linkTab: (tabId: string) => void;
  unlink: () => void;
  hydrate: (data: {
    text: string;
    width: number;
    mode?: ReferenceMode;
    linkedTabId?: string | null;
  }) => void;
}

export const useReferenceStore = create<ReferenceStore>((set) => ({
  text: "",
  width: REFERENCE_DEFAULT_WIDTH,
  mode: "scratch",
  linkedTabId: null,
  setText: (text) => set({ text }),
  setWidth: (width) => set({ width: clampReferenceWidth(width) }),
  clear: () => set({ text: "" }),
  linkTab: (tabId) => set({ mode: "tab", linkedTabId: tabId }),
  unlink: () => set({ mode: "scratch", linkedTabId: null }),
  hydrate: ({ text, width, mode, linkedTabId }) =>
    set({
      text,
      width: clampReferenceWidth(width),
      mode: mode ?? "scratch",
      linkedTabId: linkedTabId ?? null,
    }),
}));
