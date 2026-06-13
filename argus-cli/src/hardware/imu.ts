/**
 * IMU — BNO085 presence detection over I2C.
 *
 * This build does DETECTION ONLY: `i2cdetect` confirms the sensor answers at
 * 0x4A (and reports the BMS sharing the bus at 0x6B). Reading the fused motion
 * data needs the BNO085 SHTP protocol (a bundled helper lib) and is deferred
 * to a later phase.
 */
import { IMU } from "../config/hardware.js";
import { commandExists, run } from "../lib/exec.js";
import { isMock } from "../lib/platform.js";
import { ok, unavailable, type HalResult } from "./types.js";
import { I2CDETECT } from "../mocks/fixtures.js";

export interface ImuDetect {
  bus: number;
  addresses: number[];
  /** The BNO085 address actually found (0x4A or 0x4B), or null if absent. */
  imuAddress: number | null;
  imuPresent: boolean;
  bmsPresent: boolean;
}

/** First candidate BNO085 address present on the bus, or null. */
export function findImuAddress(
  present: number[],
  candidates: readonly number[] = IMU.addresses,
): number | null {
  return candidates.find((addr) => present.includes(addr)) ?? null;
}

/**
 * Pure parser for `i2cdetect -y N` grids.
 *
 * The grid is fixed-width: 3 chars per column after the "NN:" row label.
 * A cell is "--" (absent), "UU" (present but claimed by a kernel driver),
 * blank (reserved), or the hex address. We treat the printed hex and "UU"
 * alike: both mean a device acked, and the address is rowBase + columnIndex.
 */
export function parseI2cDetect(stdout: string): number[] {
  const addresses: number[] = [];
  for (const line of stdout.split("\n")) {
    const m = line.match(/^([0-9a-f]{2}):(.*)$/i);
    if (!m) continue;
    const base = parseInt(m[1], 16);
    const rest = m[2];
    for (let col = 0; col < 16; col++) {
      const cell = rest.slice(col * 3, col * 3 + 3).trim();
      if (!cell || cell === "--") continue;
      addresses.push(base + col);
    }
  }
  return addresses;
}

function buildDetect(addresses: number[]): ImuDetect {
  const imuAddress = findImuAddress(addresses);
  return {
    bus: IMU.i2cBus,
    addresses,
    imuAddress,
    imuPresent: imuAddress !== null,
    bmsPresent: addresses.includes(IMU.bmsAddress),
  };
}

export async function detectImu(): Promise<HalResult<ImuDetect>> {
  if (isMock()) return ok(buildDetect(parseI2cDetect(I2CDETECT)));

  if (!(await commandExists("i2cdetect"))) {
    return unavailable("i2cdetect not found — install i2c-tools.");
  }
  const res = await run("i2cdetect", ["-y", String(IMU.i2cBus)]);
  if (res.failed) {
    return unavailable(res.stderr.trim() || `i2cdetect failed on bus ${IMU.i2cBus}`);
  }
  return ok(buildDetect(parseI2cDetect(res.stdout)));
}
