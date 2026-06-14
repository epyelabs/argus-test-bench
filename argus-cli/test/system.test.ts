import { describe, expect, it } from "vitest";
import type { CpuInfo } from "node:os";
import {
  computeCpuLoad,
  parseDf,
  parseMemAvailable,
  parseOsRelease,
} from "../src/hardware/system.js";

/** Build a one-core CpuInfo snapshot from busy/idle tick totals. */
function core(user: number, sys: number, idle: number): CpuInfo {
  return {
    model: "test",
    speed: 1000,
    times: { user, nice: 0, sys, idle, irq: 0 },
  };
}

describe("computeCpuLoad", () => {
  it("computes per-core busy% as (Δtotal − Δidle) / Δtotal", () => {
    // core0: Δtotal 500, Δidle 400 → 100/500 = 20%. core1: all idle → 0%.
    const prev = [core(100, 50, 850), core(0, 0, 1000)];
    const curr = [core(150, 100, 1250), core(0, 0, 2000)];
    const load = computeCpuLoad(prev, curr);
    expect(load.perCore[0]).toBeCloseTo(20, 5);
    expect(load.perCore[1]).toBeCloseTo(0, 5);
    expect(load.overall).toBeCloseTo(10, 5); // mean of 20 and 0
  });

  it("returns 0 when no ticks elapsed (identical snapshots)", () => {
    const snap = [core(100, 50, 850)];
    expect(computeCpuLoad(snap, snap).perCore[0]).toBe(0);
  });

  it("reports 0 for a core missing from the previous snapshot", () => {
    const prev = [core(100, 50, 850)];
    const curr = [core(150, 100, 1250), core(10, 10, 980)];
    expect(computeCpuLoad(prev, curr).perCore[1]).toBe(0);
  });
});

describe("parseDf", () => {
  const LINUX_DF = [
    "Filesystem     1024-blocks      Used  Available Capacity Mounted on",
    "/dev/root         59600828  12000000  45000000      22% /",
  ].join("\n");

  it("parses 1024-byte blocks into byte totals and used%", () => {
    const u = parseDf(LINUX_DF);
    expect(u).not.toBeNull();
    expect(u!.totalBytes).toBe(59600828 * 1024);
    expect(u!.usedBytes).toBe(12000000 * 1024);
    expect(u!.usedPct).toBeCloseTo((12000000 / 59600828) * 100, 3);
  });

  it("returns null on header-only or unparseable output", () => {
    expect(parseDf("Filesystem 1024-blocks Used Available Capacity Mounted")).toBeNull();
    expect(parseDf("nonsense")).toBeNull();
  });
});

describe("parseMemAvailable", () => {
  const MEMINFO = [
    "MemTotal:        8136816 kB",
    "MemFree:          512345 kB",
    "MemAvailable:    6291456 kB",
    "Buffers:           12345 kB",
  ].join("\n");

  it("reads MemTotal/MemAvailable in bytes", () => {
    const m = parseMemAvailable(MEMINFO);
    expect(m).toEqual({
      totalBytes: 8136816 * 1024,
      availableBytes: 6291456 * 1024,
    });
  });

  it("returns null when MemAvailable is absent", () => {
    expect(parseMemAvailable("MemTotal: 8136816 kB")).toBeNull();
  });
});

describe("parseOsRelease", () => {
  it("builds 'Name Codename' from NAME + VERSION_CODENAME", () => {
    const text = [
      'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"',
      'NAME="Debian GNU/Linux"',
      'VERSION_ID="12"',
      "VERSION_CODENAME=bookworm",
      "ID=debian",
    ].join("\n");
    expect(parseOsRelease(text)).toBe("Debian Bookworm");
  });

  it("falls back to PRETTY_NAME when there is no codename", () => {
    expect(parseOsRelease('PRETTY_NAME="Alpine Linux v3.19"')).toBe("Alpine Linux v3.19");
  });

  it("returns null for empty input", () => {
    expect(parseOsRelease("")).toBeNull();
  });
});
