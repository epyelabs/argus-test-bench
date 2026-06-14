/**
 * RGB LED control — a thin, color-keyed wrapper over the generic GPIO HAL.
 *
 * The LED is active-HIGH per the board guide (1 = ON), and `pinctrl` drives
 * persist after the command exits, which is exactly what a set-and-forget LED
 * toggle needs. The actual pinctrl plumbing lives in `gpio.ts`.
 */
import { RGB_LED, type LedColor } from "../config/hardware.js";
import { getGpio, setGpio } from "./gpio.js";
import { ok, type HalResult } from "./types.js";

// Re-exported so existing importers (boardId, tests) keep their led.js import.
export { parsePinctrlLevel } from "./gpio.js";

export const LED_COLORS = Object.keys(RGB_LED) as LedColor[];

export async function setLed(color: LedColor, on: boolean): Promise<HalResult<{ on: boolean }>> {
  const r = await setGpio(RGB_LED[color].gpio, on);
  return r.available ? ok({ on: r.data.high }) : r;
}

export async function getLed(color: LedColor): Promise<HalResult<{ on: boolean }>> {
  const r = await getGpio(RGB_LED[color].gpio);
  return r.available ? ok({ on: r.data.high }) : r;
}

export async function getAllLeds(): Promise<HalResult<Record<LedColor, boolean>>> {
  const result = {} as Record<LedColor, boolean>;
  for (const color of LED_COLORS) {
    const r = await getLed(color);
    if (!r.available) return r;
    result[color] = r.data.on;
  }
  return ok(result);
}

export async function setAllLeds(on: boolean): Promise<HalResult<void>> {
  for (const color of LED_COLORS) {
    const r = await setLed(color, on);
    if (!r.available) return r;
  }
  return ok(undefined);
}
