/**
 * LTE / GNSS (SIM7600X-H-M2).
 *
 * The connection-manager daemon owns the AT port (/dev/ttyUSB2) and polls it
 * continuously, so this module never opens it. Instead:
 *   - presence    → lsusb (SimCom 1e0e:9011) + /dev/ttyUSB* enumeration
 *   - signal/link → the daemon's atomic telemetry JSON
 *   - GPS         → read-only NMEA from the dedicated /dev/ttyUSB1 port
 */
import { createReadStream } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { LTE } from "../config/hardware.js";
import { run } from "../lib/exec.js";
import { isMock } from "../lib/platform.js";
import { aggregateFix, type GpsFix } from "../lib/nmea.js";
import { ok, unavailable, type HalResult } from "./types.js";
import { LSUSB, NMEA_LINES, TELEMETRY_JSON } from "../mocks/fixtures.js";

export interface ModemInfo {
  present: boolean;
  usbId?: string;
  description?: string;
  ttyPorts: string[];
}

export interface Telemetry {
  timestamp: string;
  csq: number;
  rssi_dbm: number | null;
  csq_interval: number;
  status: string;
  iface: string;
  ip: string | null;
}

export interface GpsResult {
  fix: GpsFix;
  sentenceCount: number;
}

/** Pure: find the modem line in `lsusb` output by vendor/product id. */
export function findModemLine(
  stdout: string,
  vendorId: string,
  productIds: readonly string[],
): { usbId: string; description: string } | null {
  for (const line of stdout.split("\n")) {
    const m = line.match(/ID\s+([0-9a-f]{4}):([0-9a-f]{4})\s*(.*)/i);
    if (!m) continue;
    const [, vid, pid, desc] = m;
    if (vid.toLowerCase() === vendorId.toLowerCase() && productIds.includes(pid.toLowerCase())) {
      return { usbId: `${vid}:${pid}`, description: desc.trim() };
    }
  }
  return null;
}

async function listTtyUsb(): Promise<string[]> {
  try {
    const entries = await readdir("/dev");
    return entries
      .filter((e) => /^ttyUSB\d+$/.test(e))
      .map((e) => `/dev/${e}`)
      .sort();
  } catch {
    return [];
  }
}

export async function detectModem(): Promise<HalResult<ModemInfo>> {
  if (isMock()) {
    const m = findModemLine(LSUSB, LTE.usbVendorId, LTE.usbProductIds);
    return ok({
      present: !!m,
      usbId: m?.usbId,
      description: m?.description,
      ttyPorts: ["/dev/ttyUSB0", "/dev/ttyUSB1", "/dev/ttyUSB2", "/dev/ttyUSB3"],
    });
  }

  const res = await run("lsusb");
  if (res.notFound) return unavailable("lsusb not found — install usbutils.");
  if (res.failed) return unavailable(res.stderr.trim() || "lsusb failed");

  const m = findModemLine(res.stdout, LTE.usbVendorId, LTE.usbProductIds);
  return ok({
    present: !!m,
    usbId: m?.usbId,
    description: m?.description,
    ttyPorts: await listTtyUsb(),
  });
}

export async function readTelemetry(): Promise<HalResult<Telemetry>> {
  if (isMock()) return ok(JSON.parse(TELEMETRY_JSON) as Telemetry);

  try {
    const raw = await readFile(LTE.telemetryFile, "utf8");
    return ok(JSON.parse(raw) as Telemetry);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return unavailable("No telemetry — sim7600-lte.service is not running yet.");
    }
    return unavailable(`Could not read telemetry: ${(err as Error).message}`);
  }
}

/**
 * Read NMEA from the GPS port for `durationMs` and aggregate a fix.
 * Empty result means GPS may need enabling (AT+CGPS on the AT port via the daemon).
 */
export async function readGps(
  port: string = LTE.nmeaPort,
  durationMs = 4000,
): Promise<HalResult<GpsResult>> {
  if (isMock()) {
    return ok({ fix: aggregateFix(NMEA_LINES), sentenceCount: NMEA_LINES.length });
  }

  return new Promise((resolve) => {
    let settled = false;
    const lines: string[] = [];
    let buf = "";

    const stream = createReadStream(port, { encoding: "utf8" });

    const finish = (result: HalResult<GpsResult>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stream.destroy();
      resolve(result);
    };

    const timer = setTimeout(() => {
      const sentences = lines.filter((l) => l.trimStart().startsWith("$"));
      finish(ok({ fix: aggregateFix(sentences), sentenceCount: sentences.length }));
    }, durationMs);

    stream.on("data", (chunk: string | Buffer) => {
      buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      lines.push(...parts);
    });

    stream.on("error", (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") finish(unavailable(`GPS port ${port} not present.`));
      else if (code === "EACCES") finish(unavailable(`Permission denied on ${port} (try sudo / dialout group).`));
      else finish(unavailable((err as Error).message));
    });
  });
}
