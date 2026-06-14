/**
 * Board ID strap reader via `pinctrl` (raspi-utils).
 *
 * The board encodes its hardware version on three read-only input straps —
 * Board_ID_0/1/2 on GPIO 26/13/6 (see the v1.0 board User Guide, Board ID
 * Table). We sample each pin with `pinctrl get`, decode the 3 bits into a code
 * string, and map that to the board's part number. The current board reads
 * 000 = ARGUS:A:A:00 (Edge Video Node v1.0). Nothing here drives a pin: this
 * is the read-only counterpart to the LED HAL.
 */
import { BOARD_ID } from "../config/hardware.js";
import { isMock } from "../lib/platform.js";
import { getGpio } from "./gpio.js";
import { ok, type HalResult } from "./types.js";

export interface BoardIdInfo {
  /** Per-pin level, in BOARD_ID.gpios order (index 0 = Board_ID_0 = GPIO26). */
  bits: boolean[];
  /** 3-char code, gpios read in array order (gpios[0] first). e.g. "000". */
  code: string;
  /** Part number from BOARD_ID.known, or null for an unrecognized strap. */
  partNumber: string | null;
}

/**
 * Decode sampled strap levels into a code + known part number. Pure (no I/O)
 * so it is unit-testable. Reads the gpios in array order; for the only defined
 * board (all-low → "000") the bit order is moot.
 */
export function decodeBoardId(bits: boolean[]): { code: string; partNumber: string | null } {
  const code = bits.map((b) => (b ? "1" : "0")).join("");
  return { code, partNumber: BOARD_ID.known[code] ?? null };
}

export async function readBoardId(): Promise<HalResult<BoardIdInfo>> {
  if (isMock()) {
    // No straps to read off-hardware; report the known v1.0 board (all-low).
    const bits = BOARD_ID.gpios.map(() => false);
    return ok({ bits, ...decodeBoardId(bits) });
  }

  const bits: boolean[] = [];
  for (const gpio of BOARD_ID.gpios) {
    const r = await getGpio(gpio);
    if (!r.available) return r;
    bits.push(r.data.high);
  }
  return ok({ bits, ...decodeBoardId(bits) });
}
