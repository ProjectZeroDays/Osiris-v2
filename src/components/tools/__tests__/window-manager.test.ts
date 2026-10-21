import { describe, it, expect } from "vitest";
import type { SecurityToolId } from "@/config/security-tools";
import {
  EMPTY_STACK,
  MAX_OPEN_WINDOWS,
  cycle,
  closeAll,
  closeWindow,
  focusedWindow,
  focusWindow,
  isOpen,
  openWindow,
  zIndex,
} from "../window-manager";

/**
 * The window manager, tested as the rules it is.
 *
 * No rendering here: what matters is the ordering, focus and capping,
 * and those are decisions this module makes on plain data.
 */

const shodan: SecurityToolId = "shodan";
const zenmap: SecurityToolId = "zenmap";
const sherlock: SecurityToolId = "sherlock";
const wifite3: SecurityToolId = "wifite3";
const ruflo: SecurityToolId = "ruflo";
const maltego: SecurityToolId = "maltego";
const spytv: SecurityToolId = "spytv";

describe("the window manager", () => {
  it("starts with nothing open", () => {
    expect(EMPTY_STACK.order).toEqual([]);
    expect(focusedWindow(EMPTY_STACK)).toBeNull();
  });

  it("opens a window and focuses it", () => {
    const s = openWindow(EMPTY_STACK, shodan);
    expect(isOpen(s, shodan)).toBe(true);
    expect(focusedWindow(s)).toBe(shodan);
  });

  it("focuses an already-open window instead of stacking a second copy", () => {
    const s = openWindow(openWindow(EMPTY_STACK, shodan), zenmap);
    const again = openWindow(s, shodan);
    expect(again.order.length).toBe(2);
    expect(focusedWindow(again)).toBe(shodan);
    // And the window it displaced is still open, just underneath.
    expect(isOpen(again, zenmap)).toBe(true);
  });

  it("puts the newest window on top", () => {
    const s = openWindow(openWindow(openWindow(EMPTY_STACK, shodan), zenmap), sherlock);
    expect(s.order).toEqual([shodan, zenmap, sherlock]);
    expect(zIndex(s, sherlock)).toBeGreaterThan(zIndex(s, zenmap));
    expect(zIndex(s, zenmap)).toBeGreaterThan(zIndex(s, shodan));
  });

  it("gives a window that is not open no z-index at all", () => {
    expect(zIndex(openWindow(EMPTY_STACK, shodan), zenmap)).toBe(0);
  });

  it("closes a window and hands the focus to the one beneath", () => {
    const s = openWindow(openWindow(openWindow(EMPTY_STACK, shodan), zenmap), sherlock);
    const closed = closeWindow(s, sherlock);
    expect(isOpen(closed, sherlock)).toBe(false);
    expect(focusedWindow(closed)).toBe(zenmap);
  });

  it("closing the only window leaves nothing open", () => {
    expect(closeWindow(openWindow(EMPTY_STACK, shodan), shodan).order).toEqual([]);
  });

  it("ignores a close for a window that is not open", () => {
    const s = openWindow(EMPTY_STACK, shodan);
    expect(closeWindow(s, zenmap)).toBe(s);
  });

  it("brings an open window forward without opening a closed one", () => {
    const s = openWindow(openWindow(openWindow(EMPTY_STACK, shodan), zenmap), sherlock);
    expect(focusedWindow(focusWindow(s, shodan))).toBe(shodan);
    expect(isOpen(focusWindow(s, wifite3), wifite3)).toBe(false);
  });

  it("drops the oldest window once the cap is reached", () => {
    let s: ReturnType<typeof openWindow> = EMPTY_STACK;
    for (const id of [shodan, zenmap, sherlock, wifite3, ruflo, maltego]) {
      s = openWindow(s, id);
    }
    expect(s.order.length).toBe(MAX_OPEN_WINDOWS);

    // The seventh opens, and the oldest is the one that goes.
    const seventh = openWindow(s, spytv);
    expect(seventh.order.length).toBe(MAX_OPEN_WINDOWS);
    expect(isOpen(seventh, spytv)).toBe(true);
    expect(isOpen(seventh, shodan)).toBe(false);
    expect(focusedWindow(seventh)).toBe(spytv);
  });

  it("cycles through the open windows, wrapping around", () => {
    const s = openWindow(openWindow(openWindow(EMPTY_STACK, shodan), zenmap), sherlock);
    const next = cycle(s);
    expect(focusedWindow(next)).toBe(shodan);
    expect(focusedWindow(cycle(next))).toBe(zenmap);
    // Wrapping back the other way.
    expect(focusedWindow(cycle(s, -1))).toBe(zenmap);
  });

  it("keeps the order of the windows it did not focus", () => {
    const s = openWindow(openWindow(openWindow(EMPTY_STACK, shodan), zenmap), sherlock);
    // Focus moves to shodan; zenmap stays above where sherlock was.
    expect(cycle(s).order).toEqual([zenmap, sherlock, shodan]);
  });

  it("has nowhere to cycle with one window or none", () => {
    expect(cycle(EMPTY_STACK)).toBe(EMPTY_STACK);
    const one = openWindow(EMPTY_STACK, shodan);
    expect(cycle(one)).toBe(one);
  });

  it("closes everything at once", () => {
    const s = openWindow(openWindow(openWindow(EMPTY_STACK, shodan), zenmap), sherlock);
    expect(s.order.length).toBe(3);
    expect(closeAll()).toEqual(EMPTY_STACK);
  });
});
