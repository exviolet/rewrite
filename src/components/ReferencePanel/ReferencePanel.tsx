import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useEditorStore } from "../../store/editorStore";
import {
  useReferenceStore,
  clampReferenceWidth,
} from "../../store/referenceStore";
import { toast } from "../../store/toastStore";

interface ReferencePanelProps {
  onClose: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

function joinWithSpacing(before: string, inserted: string, after: string) {
  const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
  const suffix = after && !after.startsWith("\n") ? "\n\n" : "";
  return `${before}${prefix}${inserted}${suffix}${after}`;
}

export function ReferencePanel({ onClose, textareaRef }: ReferencePanelProps) {
  const text = useReferenceStore((s) => s.text);
  const setText = useReferenceStore((s) => s.setText);
  const setWidth = useReferenceStore((s) => s.setWidth);
  const clear = useReferenceStore((s) => s.clear);
  const width = useReferenceStore((s) => s.width);
  const mode = useReferenceStore((s) => s.mode);
  const linkedTabId = useReferenceStore((s) => s.linkedTabId);
  const linkTab = useReferenceStore((s) => s.linkTab);
  const unlink = useReferenceStore((s) => s.unlink);
  const tabs = useEditorStore((s) => s.tabs);
  const linkedTab = useEditorStore((s) =>
    mode === "tab" && linkedTabId
      ? s.tabs.find((t) => t.id === linkedTabId) ?? null
      : null,
  );

  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerInputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const linkedTabClosed = mode === "tab" && linkedTabId !== null && linkedTab === null;
  const sourceText = mode === "tab" ? (linkedTab?.content ?? "") : text;
  const filteredTabs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return tabs;
    return tabs.filter((tab) => tab.title.toLowerCase().includes(normalized));
  }, [query, tabs]);

  useEffect(() => {
    if (!pickerOpen) return;
    pickerInputRef.current?.focus();

    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPickerOpen(false);
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [pickerOpen]);

  // Re-clamp width on viewport resize so panel never exceeds bounds
  useEffect(() => {
    function handleResize() {
      const current = useReferenceStore.getState().width;
      const clamped = clampReferenceWidth(current);
      if (clamped !== current) {
        useReferenceStore.getState().setWidth(clamped);
      }
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  function handleResizeStart(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    dragStateRef.current = {
      startX: e.clientX,
      startWidth: useReferenceStore.getState().width,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(ev: MouseEvent) {
      const drag = dragStateRef.current;
      if (!drag) return;
      const next = drag.startWidth + (drag.startX - ev.clientX);
      setWidth(next);
    }
    function onUp() {
      dragStateRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function insertIntoPrompt() {
    const reference = sourceText.trim();
    if (!reference) {
      toast("Reference пустой", "info");
      return;
    }

    const { tabs, activeTabId, updateContent } = useEditorStore.getState();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;

    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? tab.content.length;
    const end = textarea?.selectionEnd ?? tab.content.length;
    const next = joinWithSpacing(
      tab.content.slice(0, start),
      reference,
      tab.content.slice(end),
    );

    updateContent(tab.id, next);
    requestAnimationFrame(() => {
      const cursor = start + (start > 0 && !tab.content.slice(0, start).endsWith("\n") ? 2 : 0) + reference.length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(cursor, cursor);
    });
    toast("Reference вставлен в prompt", "success");
  }

  function focusLinkedTab() {
    const { activeTabId, setActiveTab } = useEditorStore.getState();
    if (!linkedTabId) return;

    const prev = activeTabId;
    setActiveTab(linkedTabId);
    if (prev && prev !== linkedTabId) linkTab(prev);
  }

  function handleSourceButtonClick() {
    setQuery("");
    setPickerOpen((open) => !open);
  }

  function handleDragOver(e: React.DragEvent<HTMLElement>) {
    if (e.dataTransfer.types.includes("application/x-rewrite-tab-id")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "link";
      setDragOver(true);
    }
  }

  function handleDragLeave(e: React.DragEvent<HTMLElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent<HTMLElement>) {
    const id = e.dataTransfer.getData("application/x-rewrite-tab-id");
    setDragOver(false);
    if (id) {
      e.preventDefault();
      linkTab(id);
    }
  }

  return (
    <aside
      style={{ width: `${width}px` }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        absolute inset-y-0 right-0 bg-surface border-l z-20 flex flex-col animate-slide-left
        ${dragOver ? "border-accent shadow-[inset_0_0_0_1px_rgba(124,110,240,0.55)]" : "border-border"}
      `}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-2 z-40 flex items-center justify-center rounded border border-dashed border-accent/70 bg-accent/10 text-[12px] text-accent">
          Привязать таб
        </div>
      )}

      <div
        onMouseDown={handleResizeStart}
        className="absolute inset-y-0 -left-0.5 w-1 cursor-col-resize hover:bg-accent/40 active:bg-accent/60 transition-colors z-30"
        title="Перетащите, чтобы изменить ширину"
      />

      <div className="flex items-center justify-between h-9 px-3 border-b border-border shrink-0">
        <div ref={pickerRef} className="relative min-w-0 flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleSourceButtonClick}
            className="min-w-0 max-w-[210px] h-6 px-2 rounded-[4px] flex items-center gap-1.5 text-[11px] tracking-wide text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            title="Выбрать источник reference"
          >
            {mode === "tab" && linkedTab && (
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="shrink-0 text-accent">
                <path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <span className="truncate">
              {mode === "scratch" ? "Scratch" : linkedTab?.title ?? "Таб закрыт"}
            </span>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="shrink-0 opacity-60">
              <path d="M2 3l2 2 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {mode === "tab" && linkedTab && (
            <button
              type="button"
              onClick={focusLinkedTab}
              className="flex items-center justify-center w-6 h-6 rounded-[4px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
              title="Открыть таб на редактирование"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M3 11.5V13h1.5l7-7-1.5-1.5-7 7zM9.5 4.5L11 3l2 2-1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          {pickerOpen && (
            <div className="absolute left-0 top-full mt-1 w-[260px] bg-surface border border-border rounded-[6px] shadow-lg overflow-hidden z-50 animate-slide-down">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-text-muted shrink-0">
                  <path d="M3 4h10M3 8h7M3 12h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <input
                  ref={pickerInputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Найти таб..."
                  className="min-w-0 flex-1 bg-transparent text-[12px] text-text outline-none placeholder:text-text-muted/50"
                />
              </div>

              <div className="max-h-[320px] overflow-y-auto py-1">
                <button
                  type="button"
                  onClick={() => {
                    unlink();
                    setPickerOpen(false);
                  }}
                  className={`
                    w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] transition-colors
                    ${mode === "scratch" ? "bg-accent/10 text-text" : "text-text-muted hover:text-text hover:bg-surface-hover/50"}
                  `}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${mode === "scratch" ? "bg-accent" : "bg-border"}`} />
                  <span className="min-w-0">
                    <span className="block truncate">Scratch</span>
                    <span className="block truncate text-[10px] text-text-muted/60">свободный текст</span>
                  </span>
                </button>

                {filteredTabs.length === 0 && (
                  <div className="px-3 py-6 text-center text-[11px] text-text-muted">
                    Ничего не найдено
                  </div>
                )}

                {filteredTabs.map((tab) => {
                  const isLinked = mode === "tab" && tab.id === linkedTabId;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        linkTab(tab.id);
                        setPickerOpen(false);
                      }}
                      className={`
                        w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] transition-colors
                        ${isLinked ? "bg-accent/10 text-text" : "text-text-muted hover:text-text hover:bg-surface-hover/50"}
                      `}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tab.isDirty ? "bg-dirty" : isLinked ? "bg-accent" : "bg-border"}`} />
                      <span className="min-w-0 flex-1 truncate">{tab.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="flex items-center justify-center w-5 h-5 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          title="Закрыть"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path
              d="M1.5 1.5l5 5M6.5 1.5l-5 5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="flex-1 min-h-0 p-3 flex flex-col gap-3">
        {linkedTabClosed ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 rounded border border-dashed border-border bg-bg/30 px-4 text-center">
            <div className="text-sm text-text">Таб закрыт</div>
            <button
              type="button"
              onClick={unlink}
              className="h-8 px-3 rounded text-[11px] bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
            >
              Вернуться к scratch
            </button>
          </div>
        ) : (
          <>
            {mode === "scratch" ? (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Временный контекст, требования, ошибка, факты для промпта..."
                className="flex-1 min-h-0 resize-none bg-bg border border-border rounded px-2.5 py-2 text-[12px] leading-relaxed text-text outline-none focus:border-accent/50 placeholder:text-text-muted/45"
              />
            ) : (
              <textarea
                readOnly
                value={linkedTab?.content ?? ""}
                className="flex-1 min-h-0 resize-none bg-bg/60 border border-border rounded px-2.5 py-2 text-[12px] leading-relaxed text-text outline-none placeholder:text-text-muted/45"
              />
            )}

            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={insertIntoPrompt}
                disabled={!sourceText.trim()}
                className="h-8 text-[11px] bg-accent/20 text-accent hover:bg-accent/30 rounded transition-colors disabled:opacity-40"
              >
                Вставить
              </button>
              {mode === "scratch" ? (
                <button
                  onClick={clear}
                  disabled={!text}
                  className="h-8 text-[11px] text-text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors disabled:opacity-40"
                >
                  Очистить
                </button>
              ) : (
                <button
                  onClick={unlink}
                  className="h-8 text-[11px] text-text-muted hover:text-text hover:bg-surface-hover rounded transition-colors"
                >
                  Отвязать
                </button>
              )}
            </div>
          </>
        )}

        <div className="text-[10px] leading-relaxed text-text-muted/60">
          {mode === "scratch"
            ? "Текст хранится локально и не привязан к табам."
            : "Зеркало таба (read-only). Карандаш — открыть на редактирование."}
        </div>
      </div>
    </aside>
  );
}
