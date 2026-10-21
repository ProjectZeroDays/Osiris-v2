import type { SecurityToolId } from "@/config/security-tools";

/**
 * Which windows are open, and which one is on top.
 *
 * The overlay used to render one window at a time: opening a second tool
 * replaced the first, and there was no way back to it except finding the
 * card again. This is the state that replaces that — an ordered list of
 * open windows (the last is the focused one) plus the operations an
 * app switcher needs.
 *
 * It is deliberately plain data and pure functions, so the rules about
 * ordering, focus and capping are testable without rendering anything.
 */

export interface WindowStack {
  /** Open windows, bottom first. The last entry is the focused one. */
  readonly order: readonly SecurityToolId[];
}

export const EMPTY_STACK: WindowStack = { order: [] };

/**
 * How many windows may be open at once.
 *
 * A switcher with fifty entries is not a switcher. The oldest window
 * falls off the bottom rather than the newest being refused — the user
 * asked for the new one.
 */
export const MAX_OPEN_WINDOWS = 6;

/** The focused window, or null when nothing is open. */
export function focusedWindow(stack: WindowStack): SecurityToolId | null {
  return stack.order.length ? stack.order[stack.order.length - 1] : null;
}

export function isOpen(stack: WindowStack, id: SecurityToolId): boolean {
  return stack.order.includes(id);
}

/** The focused window's z-index; every other window sits below it. */
export function zIndex(stack: WindowStack, id: SecurityToolId): number {
  const i = stack.order.indexOf(id);
  return i === -1 ? 0 : i + 1;
}

/**
 * Open a window, or bring an already-open one to the front.
 *
 * Re-opening an open tool must focus it, not stack a second copy.
 */
export function openWindow(stack: WindowStack, id: SecurityToolId): WindowStack {
  const rest = stack.order.filter((w) => w !== id);
  const order = [...rest, id];
  if (order.length > MAX_OPEN_WINDOWS) {
    return { order: order.slice(order.length - MAX_OPEN_WINDOWS) };
  }
  return { order };
}

/** Close a window. Focus falls to whatever was beneath it. */
export function closeWindow(stack: WindowStack, id: SecurityToolId): WindowStack {
  if (!stack.order.includes(id)) return stack;
  return { order: stack.order.filter((w) => w !== id) };
}

/** Bring an open window to the front. A closed window is left alone. */
export function focusWindow(stack: WindowStack, id: SecurityToolId): WindowStack {
  if (!stack.order.includes(id)) return stack;
  return openWindow(stack, id);
}

/**
 * Close every window.
 *
 * The switcher offers one action for the whole stack, and a session that
 * ends should not leave six windows behind.
 */
export function closeAll(): WindowStack {
  return EMPTY_STACK;
}

/**
 * Move to the next window, wrapping around — the app-switcher gesture.
 *
 * The window beneath the focus stays where it is in the stack; only the
 * newly focused one comes up, so switching back and forth does not
 * scramble the order of everything else. With fewer than two windows
 * there is nowhere to go, so the stack is returned unchanged rather than
 * reporting a change that did not happen.
 */
export function cycle(stack: WindowStack, steps = 1): WindowStack {
  const n = stack.order.length;
  if (n < 2) return stack;
  const current = stack.order.indexOf(focusedWindow(stack)!);
  const target = stack.order[(((current + steps) % n) + n) % n];
  return openWindow(stack, target);
}
