/**
 * Host system metrics (CPU, memory, disk, temperature, OS identity).
 *
 * Unlike the peripheral HAL modules, this reads the machine the CLI runs on so
 * the header can surface device health (throttling, low RAM, full disk). Every
 * reader degrades independently: anything it cannot obtain returns null/empty
 * rather than throwing, so the same code renders cleanly on a macOS dev box
 * (no thermal zone, no /proc) and on the Pi.
 *
 * The string/number parsing lives in small pure functions so it can be
 * unit-tested without real hardware.
 */
import * as os from "node:os";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { run } from "../lib/exec.js";

export interface UsageInfo {
  totalBytes: number;
  usedBytes: number;
  usedPct: number;
}

export interface CpuLoad {
  /** Mean busy% across all cores, 0–100. */
  overall: number;
  /** Busy% per core in core order, 0–100. */
  perCore: number[];
}

export type CpuSample = os.CpuInfo[];

/** Snapshot of cumulative CPU tick counters; `.length` is the core count. */
export function sampleCpu(): CpuSample {
  return os.cpus();
}

/**
 * Pure: busy% per core from two tick snapshots taken some time apart.
 * busy = (Δtotal − Δidle) / Δtotal. Cores with no elapsed ticks read 0.
 */
export function computeCpuLoad(prev: CpuSample, curr: CpuSample): CpuLoad {
  const perCore: number[] = [];
  for (let i = 0; i < curr.length; i++) {
    const p = prev[i]?.times;
    const c = curr[i].times;
    if (!p) {
      perCore.push(0);
      continue;
    }
    const totalPrev = p.user + p.nice + p.sys + p.idle + p.irq;
    const totalCurr = c.user + c.nice + c.sys + c.idle + c.irq;
    const dTotal = totalCurr - totalPrev;
    const dIdle = c.idle - p.idle;
    perCore.push(dTotal > 0 ? clampPct(((dTotal - dIdle) / dTotal) * 100) : 0);
  }
  const overall =
    perCore.length > 0 ? perCore.reduce((a, b) => a + b, 0) / perCore.length : 0;
  return { overall, perCore };
}

/** 1/5/15-minute load average. (All zeros on platforms without it, e.g. Windows.) */
export function loadAverage(): [number, number, number] {
  const [a, b, c] = os.loadavg();
  return [a, b, c];
}

/**
 * Pure: extract MemTotal/MemAvailable (kB) from /proc/meminfo text.
 * MemAvailable is the kernel's estimate of allocatable memory, which excludes
 * reclaimable cache — a far more honest "used" than total − free on Linux.
 */
export function parseMemAvailable(
  meminfo: string,
): { totalBytes: number; availableBytes: number } | null {
  const total = meminfo.match(/^MemTotal:\s+(\d+)\s*kB/m);
  const avail = meminfo.match(/^MemAvailable:\s+(\d+)\s*kB/m);
  if (!total || !avail) return null;
  return {
    totalBytes: Number(total[1]) * 1024,
    availableBytes: Number(avail[1]) * 1024,
  };
}

/** RAM usage, preferring /proc/meminfo's MemAvailable, falling back to os.freemem(). */
export function readMemory(): UsageInfo {
  try {
    const parsed = parseMemAvailable(readFileSync("/proc/meminfo", "utf8"));
    if (parsed) {
      const usedBytes = parsed.totalBytes - parsed.availableBytes;
      return usage(parsed.totalBytes, usedBytes);
    }
  } catch {
    /* no /proc — fall through to the os module */
  }
  const total = os.totalmem();
  return usage(total, total - os.freemem());
}

/** CPU temperature in °C, or null when the thermal zone isn't present (off-Pi). */
export async function readCpuTemp(): Promise<number | null> {
  try {
    const raw = await readFile("/sys/class/thermal/thermal_zone0/temp", "utf8");
    const milli = Number(raw.trim());
    return Number.isFinite(milli) ? milli / 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Pure: parse `df -kP <mount>` output (1024-byte blocks, single data line).
 * Columns: Filesystem 1024-blocks Used Available Capacity Mounted-on.
 */
export function parseDf(stdout: string): UsageInfo | null {
  const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;
  const cols = lines[1].trim().split(/\s+/);
  const blocks = Number(cols[1]);
  const used = Number(cols[2]);
  if (!Number.isFinite(blocks) || !Number.isFinite(used) || blocks <= 0) return null;
  return usage(blocks * 1024, used * 1024);
}

/** Disk usage for a mount point via `df`, or null if df is missing/unparseable. */
export async function readDisk(mount = "/"): Promise<UsageInfo | null> {
  const res = await run("df", ["-kP", mount]);
  if (res.notFound || res.failed) return null;
  return parseDf(res.stdout);
}

/**
 * Pure: build a short OS label from /etc/os-release text, e.g. "Debian Bookworm".
 * Prefers NAME's first word + capitalized VERSION_CODENAME; falls back to
 * PRETTY_NAME, then NAME, then null.
 */
export function parseOsRelease(text: string): string | null {
  const map = new Map<string, string>();
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    map.set(m[1], val);
  }
  const name = map.get("NAME");
  const codename = map.get("VERSION_CODENAME");
  if (name && codename) return `${name.split(/\s+/)[0]} ${capitalize(codename)}`;
  return map.get("PRETTY_NAME") ?? name ?? null;
}

/** Map Node's arch ids to the names people actually recognize. */
export function archLabel(): string {
  const a = os.arch();
  if (a === "arm64") return "aarch64";
  if (a === "x64") return "x86_64";
  return a;
}

let cachedOs: { pretty: string; arch: string } | undefined;

/** OS name + architecture, e.g. { pretty: "Debian Bookworm", arch: "aarch64" }. Read once. */
export function osInfo(): { pretty: string; arch: string } {
  if (cachedOs) return cachedOs;
  let pretty: string;
  try {
    pretty = parseOsRelease(readFileSync("/etc/os-release", "utf8")) ?? os.type();
  } catch {
    pretty = os.type();
  }
  cachedOs = { pretty, arch: archLabel() };
  return cachedOs;
}

function usage(totalBytes: number, usedBytes: number): UsageInfo {
  const clampedUsed = Math.max(0, Math.min(usedBytes, totalBytes));
  return {
    totalBytes,
    usedBytes: clampedUsed,
    usedPct: totalBytes > 0 ? (clampedUsed / totalBytes) * 100 : 0,
  };
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
