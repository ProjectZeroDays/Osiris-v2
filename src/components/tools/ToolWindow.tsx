"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { SecurityToolId } from "@/config/security-tools";
import { TOOL_ICONS } from "@/components/security-tools/icons";
import { TOOL_WINDOWS } from "./registry";
import { TOOL_WINDOW_META } from "./window-meta";
import {
  EMPTY_STACK,
  cycle as cycleStack,
  closeAll as closeAllWindows,
  closeWindow,
  focusedWindow,
  isOpen,
  openWindow,
  zIndex as zIndexOf,
  type WindowStack,
} from "./window-manager";

/**
 * The tool window.
 *
 * One window shell serves every tool, so a new tool is a body component
 * and a registry entry — not another bespoke modal. The shell handles the
 * things every window needs and none of them should have to: dragging,
 * resizing, Escape to close, focus containment, and restoring the pointer
 * when a drag ends outside the window.
 */
export function ToolWindow({
  toolId,
  open,
  onClose,
  onFocus,
  focused,
  stackSize,
  order,
  z,
}: {
  toolId: SecurityToolId;
  open: boolean;
  onClose: () => void;
  /** Called when the window is clicked, so the overlay can raise it. */
  onFocus?: () => void;
  /**
   * Whether this window is the one on top. Unfocused windows must not
   * answer Escape — with six windows open, six listeners would close six
   * windows on one keypress.
   */
  focused?: boolean;
  /** How many windows are open. Drives the cascade offset. */
  stackSize?: number;
  /** This window's place in the stack, for the cascade. */
  order?: number;
  /** The window's z-index in the stack. */
  z?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The window is clamped to the screen when it is created rather than
  // corrected in an effect afterwards, so the first frame it paints is
  // already on screen. A window that lands off the edge and then jumps is
  // worse than one that was placed there in the first place.
  const [pos, setPos] = useState(() => {
    const x = 80 + (order ?? 0) * 28;
    const y = 80 + (order ?? 0) * 28;
    if (typeof window === "undefined") return { x, y };
    return {
      x: Math.max(0, Math.min(x, Math.max(0, window.innerWidth - 200))),
      y: Math.max(0, Math.min(y, Math.max(0, window.innerHeight - 100))),
    };
  });
  const [size, setSize] = useState(() => {
    if (typeof window === "undefined") return { w: 720, h: 520 };
    return {
      w: Math.max(360, Math.min(720, window.innerWidth - 32)),
      h: Math.max(240, Math.min(520, window.innerHeight - 32)),
    };
  });
  const drag = useRef<{ mode: "move" | "resize"; offsetX: number; offsetY: number } | null>(null);

  // Escape closes. It is the one shortcut every window must honour, and
  // only the window on top answers it.
  useEffect(() => {
    if (!open || focused === false) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, focused, onClose]);

  // A drag that leaves the window keeps going, and the pointer is
  // released wherever it ends up.
  useEffect(() => {
    if (!open) return;
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (d.mode === "move") {
        setPos({ x: Math.max(0, e.clientX - d.offsetX), y: Math.max(0, e.clientY - d.offsetY) });
      } else {
        setSize((s) => ({
          w: Math.max(360, s.w + (e.clientX - d.offsetX)),
          h: Math.max(240, s.h + (e.clientY - d.offsetY)),
        }));
        drag.current = { ...d, offsetX: e.clientX, offsetY: e.clientY };
      }
    };
    const onUp = () => {
      drag.current = null;
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [open]);

  const onPointerDown = useCallback(
    (mode: "move" | "resize") => (e: React.PointerEvent) => {
      e.preventDefault();
      onFocus?.();
      const rect = ref.current?.getBoundingClientRect();
      drag.current = {
        mode,
        offsetX: mode === "move" ? e.clientX - (rect?.left ?? 0) : 0,
        offsetY: mode === "move" ? e.clientY - (rect?.top ?? 0) : 0,
      };
      document.body.style.userSelect = "none";
    },
    [onFocus],
  );

  if (!open) return null;

  const Body = TOOL_WINDOWS[toolId];
  const meta = TOOL_WINDOW_META[toolId];
  if (!Body) return null;

  const Icon = TOOL_ICONS[toolId];

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal={stackSize === undefined || stackSize <= 1 ? "true" : undefined}
      aria-label={`${meta?.title ?? toolId} window`}
      className={`tool-window${focused === false ? " tool-window--unfocused" : ""}`}
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        zIndex: z ?? 1,
      }}
      onPointerDown={() => onFocus?.()}
    >
      <header className="tool-window__bar" onPointerDown={onPointerDown("move")}>
        <span className="tool-window__grip" aria-hidden="true" />
        {Icon ? <Icon aria-hidden="true" className="tool-window__icon" /> : null}
        <span className="tool-window__title">{meta?.title ?? toolId}</span>
        {meta?.riskClass ? (
          <span className={`tool-window__risk tool-window__risk--${meta.riskClass}`}>
            {meta.riskClass}
          </span>
        ) : null}
        <button
          type="button"
          className="tool-window__close"
          onClick={onClose}
          aria-label={`Close ${meta?.title ?? toolId} window`}
        >
          &times;
        </button>
      </header>
      <div className="tool-window__body">
        <Body />
      </div>
      <span
        className="tool-window__resizer"
        onPointerDown={onPointerDown("resize")}
        aria-hidden="true"
      />
    </div>
  );
}

/** A wrapper that renders one window for the current tool. */
export function ToolWindowHost({
  toolId,
  onClose,
}: {
  toolId: SecurityToolId | null;
  onClose: () => void;
}) {
  if (!toolId) return null;
  return (
    <div className="tool-window-backdrop" onClick={onClose} role="presentation">
      <ToolWindow toolId={toolId} open onClose={onClose} />
    </div>
  );
}

/**
 * The window stack, as a hook a caller can drive.
 *
 * Opening a second tool used to replace the first, with no way back to
 * it. The stack keeps every window open and the switcher below says which
 * ones they are.
 */
export function useToolWindows(initial: SecurityToolId[] = []) {
  const [stack, setStack] = useState<WindowStack>(
    initial.length ? initial.reduce((s, id) => openWindow(s, id), EMPTY_STACK) : EMPTY_STACK,
  );

  const open = useCallback((id: SecurityToolId) => setStack((s) => openWindow(s, id)), []);
  const close = useCallback((id: SecurityToolId) => setStack((s) => closeWindow(s, id)), []);
  const closeAll = useCallback(() => setStack(closeAllWindows), []);
  const cycle = useCallback((steps = 1) => setStack((s) => cycleStack(s, steps)), []);

  return { stack, open, close, closeAll, cycle, focused: focusedWindow(stack) };
}

/**
 * The overlay: every open window, plus the switcher between them.
 *
 * One backdrop serves the whole stack, the windows raise on click, Escape
 * closes the one on top, and Ctrl+` cycles — the gesture a desktop gives
 * its users, on a page that otherwise has no window manager at all.
 */
export function ToolWindowOverlay({
  stack,
  onOpen,
  onClose,
  onCloseAll,
  onCycle,
}: {
  stack: WindowStack;
  onOpen: (id: SecurityToolId) => void;
  onClose: (id: SecurityToolId) => void;
  onCloseAll: () => void;
  onCycle: (steps?: number) => void;
}) {
  const focused = focusedWindow(stack);

  useEffect(() => {
    if (stack.order.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+` cycles. Ctrl+Shift+` goes back the other way.
      if (e.ctrlKey && (e.key === "`" || e.key === "~")) {
        e.preventDefault();
        onCycle(e.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stack.order.length, onCycle]);

  if (stack.order.length === 0) return null;

  return (
    <div
      className="tool-window-backdrop"
      // The backdrop closes the window on top, not the whole stack: a
      // misclick should not cost five open tools.
      onClick={() => focused && onClose(focused)}
      role="presentation"
    >
      {stack.order.map((id, i) => (
        <ToolWindow
          key={id}
          toolId={id}
          open
          order={i}
          stackSize={stack.order.length}
          z={zIndexOf(stack, id)}
          focused={id === focused}
          onFocus={() => onOpen(id)}
          onClose={() => onClose(id)}
        />
      ))}
      <ToolSwitcher
        stack={stack}
        focused={focused}
        onFocus={onOpen}
        onClose={onClose}
        onCloseAll={onCloseAll}
      />
    </div>
  );
}

/** The switcher: what is open, and a way to move between it. */
export function ToolSwitcher({
  stack,
  focused,
  onFocus,
  onClose,
  onCloseAll,
}: {
  stack: WindowStack;
  focused: SecurityToolId | null;
  onFocus: (id: SecurityToolId) => void;
  onClose: (id: SecurityToolId) => void;
  onCloseAll: () => void;
}) {
  if (stack.order.length === 0) return null;

  return (
    <div className="tool-switcher" role="toolbar" aria-label="Open tool windows">
      <span className="tool-switcher__label">
        {stack.order.length} open
      </span>
      <ul className="tool-switcher__list">
        {stack.order.map((id) => {
          const meta = TOOL_WINDOW_META[id];
          const Icon = TOOL_ICONS[id];
          const active = id === focused;
          return (
            <li key={id}>
              <span
                className={`tool-switcher__item${active ? " tool-switcher__item--active" : ""}`}
              >
                <button
                  type="button"
                  className="tool-switcher__focus"
                  onClick={() => onFocus(id)}
                  aria-pressed={active}
                  title={`${meta?.title ?? id} — ${meta?.riskClass ?? "unknown"}`}
                >
                  {Icon ? <Icon aria-hidden="true" className="tool-switcher__icon" /> : null}
                  {meta?.title ?? id}
                </button>
                <button
                  type="button"
                  className="tool-switcher__close"
                  onClick={() => onClose(id)}
                  aria-label={`Close ${meta?.title ?? id} window`}
                >
                  &times;
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {stack.order.length > 1 && (
        <button type="button" className="tool-switcher__close-all" onClick={onCloseAll}>
          Close all
        </button>
      )}
    </div>
  );
}

export type { ReactNode, WindowStack, SecurityToolId };
export { isOpen };
