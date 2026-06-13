/**
 * RGB LED control via `pinctrl` (raspi-utils).
 *
 * On the CM5 / RP1, legacy sysfs GPIO and RPi.GPIO do not work — `pinctrl`
 * is the supported userspace tool. `pinctrl set <n> op dh` drives the pin
 * high and the state PERSISTS after the command exits, which is exactly what
 * a set-and-forget LED toggle needs. The LED is active-HIGH per the board
 * guide (1 = ON).
 */
import { RGB_LED, type LedColor } from "../config/hardware.js";
import { commandExists, run } from "../lib/exec.js";
import { isMock } from "../lib/platform.js";
import { ok, unavailable, type HalResult } from "./types.js";

export const LED_COLORS = Object.keys(RGB_LED) as LedColor[];

/** In-memory state used only in mock mode (no hardware to read back). */
const mockState: Record<LedColor, boolean> = { red: false, green: false, blue: false };

async function ensurePinctrl(): Promise<string | null> {
  if (!(await commandExists("pinctrl"))) {
    return "pinctrl not found — install raspi-utils (Raspberry Pi OS).";
  }
  return null;
}

export async function setLed(color: LedColor, on: boolean): Promise<HalResult<{ on: boolean }>> {
  const gpio = RGB_LED[color].gpio;
  if (isMock()) {
    mockState[color] = on;
    return ok({ on });
  }
  const missing = await ensurePinctrl();
  if (missing) return unavailable(missing);

  // op = output mode, dh = drive high (ON), dl = drive low (OFF).
  const res = await run("pinctrl", ["set", String(gpio), "op", on ? "dh" : "dl"]);
  if (res.failed) return unavailable(res.stderr.trim() || "pinctrl set failed");
  return ok({ on });
}

/** Parse the level token from a `pinctrl get` line, e.g. "...| hi //". */
export function parsePinctrlLevel(line: string): boolean | null {
  const m = line.match(/\|\s*(hi|lo)\b/i) ?? line.match(/\b(hi|lo)\b/i);
  if (!m) return null;
  return m[1].toLowerCase() === "hi";
}

export async function getLed(color: LedColor): Promise<HalResult<{ on: boolean }>> {
  const gpio = RGB_LED[color].gpio;
  if (isMock()) return ok({ on: mockState[color] });

  const missing = await ensurePinctrl();
  if (missing) return unavailable(missing);

  const res = await run("pinctrl", ["get", String(gpio)]);
  if (res.failed) return unavailable(res.stderr.trim() || "pinctrl get failed");
  const level = parsePinctrlLevel(res.stdout);
  if (level === null) return unavailable(`could not parse: ${res.stdout.trim()}`);
  return ok({ on: level });
}

export async function getAllLeds(): Promise<HalResult<Record<LedColor, boolean>>> {
  const result = {} as Record<LedColor, boolean>;
  for (const color of LED_COLORS) {
    const r = await getLed(color);
    if (!r.available) return unavailable(r.reason);
    result[color] = r.data.on;
  }
  return ok(result);
}

export async function setAllLeds(on: boolean): Promise<HalResult<void>> {
  for (const color of LED_COLORS) {
    const r = await setLed(color, on);
    if (!r.available) return unavailable(r.reason);
  }
  return ok(undefined);
}
