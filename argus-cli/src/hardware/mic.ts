/**
 * Microphone — I2S MEMS (SPH0645) exposed as an ALSA capture card.
 *
 * Detection lists `arecord -l` cards and flags the I2S one. Recording writes a
 * WAV via arecord (the SPH0645 needs 32-bit frames). The live visualizer reads
 * a raw S16 mono stream off arecord's stdout and computes RMS/peak per chunk.
 */
import { mkdir } from "node:fs/promises";
import { MIC } from "../config/hardware.js";
import { commandExists, run, runStream, type RunResult, type StreamHandle } from "../lib/exec.js";
import { isMock } from "../lib/platform.js";
import { ok, unavailable, type HalResult } from "./types.js";
import { ARECORD_L } from "../mocks/fixtures.js";

export interface MicDevice {
  card: number;
  cardId: string;
  cardName: string;
  device: number;
  deviceName: string;
  /** Heuristic match against the known I2S card hints. */
  isMic: boolean;
}

export interface AudioLevel {
  /** 0..1 RMS energy. */
  rms: number;
  /** 0..1 peak sample. */
  peak: number;
}

/** Pure parser for `arecord -l`. */
export function parseArecordList(stdout: string, hints: readonly string[]): MicDevice[] {
  const devices: MicDevice[] = [];
  const re = /^card (\d+): (\S+) \[([^\]]*)\], device (\d+): (.+)$/;
  for (const line of stdout.split("\n")) {
    const m = line.match(re);
    if (!m) continue;
    const deviceName = m[5].trim();
    const haystack = `${m[2]} ${m[3]} ${deviceName}`.toLowerCase();
    devices.push({
      card: parseInt(m[1], 10),
      cardId: m[2],
      cardName: m[3],
      device: parseInt(m[4], 10),
      deviceName,
      isMic: hints.some((h) => haystack.includes(h.toLowerCase())),
    });
  }
  return devices;
}

export async function listMics(): Promise<HalResult<MicDevice[]>> {
  if (isMock()) return ok(parseArecordList(ARECORD_L, MIC.cardHints));

  if (!(await commandExists("arecord"))) {
    return unavailable("arecord not found — install alsa-utils.");
  }
  const res = await run("arecord", ["-l"]);
  // arecord -l exits non-zero with "no soundcards found".
  if (/no soundcards found/i.test(res.stdout + res.stderr)) return ok([]);
  if (res.failed && !res.stdout.trim()) {
    return unavailable(res.stderr.trim() || "arecord -l failed");
  }
  return ok(parseArecordList(res.stdout, MIC.cardHints));
}

export async function recordAudio(opts: {
  card: number;
  device: number;
  seconds: number;
  out: string;
}): Promise<HalResult<{ path: string; handle: StreamHandle }>> {
  if (isMock()) return ok({ path: opts.out, handle: timedHandle(opts.seconds * 1000) });

  if (!(await commandExists("arecord"))) return unavailable("arecord not found.");
  await mkdir(dirOf(opts.out), { recursive: true });

  const args = [
    "-D",
    `plughw:${opts.card},${opts.device}`,
    "-f",
    MIC.recordFormat,
    "-r",
    String(MIC.recordRate),
    "-c",
    String(MIC.recordChannels),
    "-d",
    String(opts.seconds),
    opts.out,
  ];
  const handle = runStream("arecord", args);
  return ok({ path: opts.out, handle });
}

/**
 * Start a live level meter. Calls `onLevel` (throttled ~60ms) until stopped.
 * Reads raw S16 mono so RMS math is trivial; `plughw` resamples for us.
 */
export function startMeter(
  opts: { card: number; device: number },
  onLevel: (level: AudioLevel) => void,
): StreamHandle {
  if (isMock()) return mockMeter(onLevel);

  let lastEmit = 0;
  const handle = runStream(
    "arecord",
    ["-D", `plughw:${opts.card},${opts.device}`, "-t", "raw", "-f", "S16_LE", "-r", "16000", "-c", "1", "-"],
    {
      onStdoutChunk: (chunk) => {
        const now = Date.now();
        if (now - lastEmit < 60) return;
        lastEmit = now;
        onLevel(levelFromS16(chunk));
      },
    },
  );
  return handle;
}

/** RMS + peak (0..1) from a little-endian signed-16 PCM buffer. */
export function levelFromS16(buf: Buffer): AudioLevel {
  const n = Math.floor(buf.length / 2);
  if (n === 0) return { rms: 0, peak: 0 };
  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const s = buf.readInt16LE(i * 2) / 32768;
    sumSq += s * s;
    const a = Math.abs(s);
    if (a > peak) peak = a;
  }
  return { rms: Math.sqrt(sumSq / n), peak };
}

function dirOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "." : p.slice(0, i);
}

function timedHandle(durationMs: number): StreamHandle {
  let resolveDone!: () => void;
  const done = new Promise<RunResult>((resolve) => {
    resolveDone = () =>
      resolve({ stdout: "", stderr: "", exitCode: 0, failed: false, notFound: false });
  });
  const timer = durationMs > 0 ? setTimeout(resolveDone, durationMs) : null;
  return {
    done,
    stop: () => {
      if (timer) clearTimeout(timer);
      resolveDone();
    },
  };
}

/** Synthetic oscillating level so the visualizer is demoable on macOS. */
function mockMeter(onLevel: (level: AudioLevel) => void): StreamHandle {
  let resolveDone!: () => void;
  const done = new Promise<RunResult>((resolve) => {
    resolveDone = () =>
      resolve({ stdout: "", stderr: "", exitCode: 0, failed: false, notFound: false });
  });
  let t = 0;
  const timer = setInterval(() => {
    t += 0.2;
    const rms = (Math.sin(t) * 0.5 + 0.5) * 0.7 + Math.random() * 0.1;
    onLevel({ rms: Math.min(1, rms), peak: Math.min(1, rms + 0.15) });
  }, 80);
  return {
    done,
    stop: () => {
      clearInterval(timer);
      resolveDone();
    },
  };
}
