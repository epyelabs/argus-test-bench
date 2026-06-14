/**
 * Generic GPIO read/write via `pinctrl` (raspi-utils).
 *
 * On the CM5 / RP1, legacy sysfs GPIO and RPi.GPIO do not work — `pinctrl` is
 * the supported userspace tool. `pinctrl set <n> op dh|dl` drives a pin and the
 * level PERSISTS after the command exits. This is the single primitive the LED,
 * Board ID and LTE-control HALs build on. Off-hardware (mock) it keeps an
 * in-memory level map so the UI is fully navigable on macOS.
 */
import { commandExists, run } from "../lib/exec.js";
import { isMock } from "../lib/platform.js";
import { ok, unavailable, type HalResult } from "./types.js";

/** In-memory levels used only in mock mode (no hardware to read back). */
const mockLevels = new Map<number, boolean>();

async function ensurePinctrl(): Promise<string | null> {
  if (!(await commandExists("pinctrl"))) {
    return "pinctrl not found — install raspi-utils (Raspberry Pi OS).";
  }
  return null;
}

/**
 * Parse the level token from a `pinctrl get` line, e.g. "...| hi //".
 *
 * A freshly booted pin that has never been driven reports function `no`
 * (none) with no level ("12: no    pd | -- // GPIO12 = none"). That is not a
 * parse failure: an undriven pin reads as low. Once driven, it reads hi/lo.
 */
export function parsePinctrlLevel(line: string): boolean | null {
  const m = line.match(/\|\s*(hi|lo)\b/i) ?? line.match(/\b(hi|lo)\b/i);
  if (m) return m[1].toLowerCase() === "hi";
  if (/\|\s*--/.test(line)) return false;
  return null;
}

/** Drive a pin as output high (dh) or low (dl). */
export async function setGpio(gpio: number, high: boolean): Promise<HalResult<{ high: boolean }>> {
  if (isMock()) {
    mockLevels.set(gpio, high);
    return ok({ high });
  }
  const missing = await ensurePinctrl();
  if (missing) return unavailable(missing);

  const res = await run("pinctrl", ["set", String(gpio), "op", high ? "dh" : "dl"]);
  if (res.failed) return unavailable(res.stderr.trim() || "pinctrl set failed");
  return ok({ high });
}

/**
 * Read a pin's current level. `fallback` is the value reported in mock mode for
 * a pin that has not been driven yet — pass a pin's hardware default so mock
 * reads stay realistic.
 */
export async function getGpio(
  gpio: number,
  fallback = false,
): Promise<HalResult<{ high: boolean }>> {
  if (isMock()) return ok({ high: mockLevels.get(gpio) ?? fallback });

  const missing = await ensurePinctrl();
  if (missing) return unavailable(missing);

  const res = await run("pinctrl", ["get", String(gpio)]);
  if (res.failed) return unavailable(res.stderr.trim() || "pinctrl get failed");
  const level = parsePinctrlLevel(res.stdout);
  if (level === null) return unavailable(`could not parse: ${res.stdout.trim()}`);
  return ok({ high: level });
}
