/** Small pure formatting helpers shared across screens. */

/** SIM7600 CSQ (0–31, or 99 = unknown) → RSSI in dBm, per the modem datasheet. */
export function csqToDbm(csq: number): number | null {
  if (csq === 99 || csq < 0 || csq > 31) return null;
  return -113 + csq * 2;
}

/** Human label for a CSQ value, matching the connection-manager thresholds. */
export function csqQuality(csq: number): string {
  if (csq === 99) return "unknown";
  if (csq <= 9) return "too weak";
  if (csq <= 14) return "marginal";
  return "good";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

/** Seconds → m:ss for elapsed timers. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

/** Hex address like 0x4a for display. */
export function toHexAddr(addr: number): string {
  return `0x${addr.toString(16).padStart(2, "0")}`;
}

/** Timestamp slug safe for filenames, derived from an ISO string. */
export function fileStamp(iso: string): string {
  return iso.replace(/[:.]/g, "-").replace(/[^0-9A-Za-z-]/g, "");
}
