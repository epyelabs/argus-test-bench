/**
 * Microphone — I2S MEMS (SPH0645) exposed as an ALSA capture card.
 *
 * Detection lists `arecord -l` cards and flags the I2S one.
 *
 * The SPH0645 is quiet: it delivers ~18 usable bits inside a 32-bit frame and
 * has no hardware gain. So we always capture the NATIVE S32 stream (preserving
 * those low bits) and apply digital gain in software — both for the live meter
 * and for recordings, which we downmix to a normal-loudness 16-bit WAV.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { MIC } from "../config/hardware.js";
import { commandExists, run, runStream, type RunResult, type StreamHandle } from "../lib/exec.js";
import { isMock } from "../lib/platform.js";
import { ok, unavailable, type HalResult } from "./types.js";
import { ARECORD_L } from "../mocks/fixtures.js";

/** Effective capture gain (ARGUS_MIC_GAIN overrides the board default). */
export function micGain(): number {
  const env = Number(process.env.ARGUS_MIC_GAIN);
  return Number.isFinite(env) && env > 0 ? env : MIC.defaultGain;
}

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

  const gain = micGain();
  const rate = MIC.recordRate;
  const channels = MIC.recordChannels;

  // Capture the raw native S32 stream so we keep the SPH0645's low bits, then
  // gain + downmix to a 16-bit WAV ourselves (no extra tools like sox needed).
  const chunks: Buffer[] = [];
  const proc = runStream(
    "arecord",
    [
      "-D",
      `plughw:${opts.card},${opts.device}`,
      "-t",
      "raw",
      "-f",
      MIC.recordFormat,
      "-r",
      String(rate),
      "-c",
      String(channels),
      "-d",
      String(opts.seconds),
      "-",
    ],
    { onStdoutChunk: (chunk) => chunks.push(chunk) },
  );

  // Wrap the process completion so the file is written before `done` resolves.
  // A SIGINT stop still leaves us captured data, so we write whenever we have any.
  const done: Promise<RunResult> = proc.done.then(async (res) => {
    const raw = Buffer.concat(chunks);
    if (raw.length === 0) {
      return { ...res, failed: true, stderr: res.stderr || "no audio captured" };
    }
    const mono = s32StereoToMonoS16(raw, gain, channels);
    await writeFile(opts.out, encodeWavPcm16(mono, rate));
    return { stdout: "", stderr: "", exitCode: 0, failed: false, notFound: false };
  });

  return ok({ path: opts.out, handle: { done, stop: proc.stop } });
}

/**
 * Start a live level meter. Calls `onLevel` (throttled ~60ms) until stopped.
 * Captures the NATIVE S32 stream (full precision for a quiet mic) and applies
 * the software gain so the meter actually moves.
 */
export function startMeter(
  opts: { card: number; device: number },
  onLevel: (level: AudioLevel) => void,
): StreamHandle {
  if (isMock()) return mockMeter(onLevel);

  const gain = micGain();
  const channels = MIC.recordChannels;
  let lastEmit = 0;
  const handle = runStream(
    "arecord",
    [
      "-D",
      `plughw:${opts.card},${opts.device}`,
      "-t",
      "raw",
      "-f",
      MIC.recordFormat,
      "-r",
      String(MIC.recordRate),
      "-c",
      String(channels),
      "-",
    ],
    {
      onStdoutChunk: (chunk) => {
        const now = Date.now();
        if (now - lastEmit < 60) return;
        lastEmit = now;
        onLevel(levelFromS32(chunk, gain, channels));
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

/**
 * RMS + peak (0..1) from interleaved little-endian signed-32 PCM, with gain.
 * Picks the louder channel so we don't dilute the reading with the I2S mic's
 * silent partner channel (the SPH0645 sits on L or R per its SEL pin).
 */
export function levelFromS32(buf: Buffer, gain = 1, channels = 1): AudioLevel {
  const frames = Math.floor(buf.length / (4 * channels));
  if (frames === 0) return { rms: 0, peak: 0 };

  let best: AudioLevel = { rms: 0, peak: 0 };
  for (let c = 0; c < channels; c++) {
    let sumSq = 0;
    let peak = 0;
    for (let f = 0; f < frames; f++) {
      const s = (buf.readInt32LE((f * channels + c) * 4) / 2147483648) * gain;
      sumSq += s * s;
      const a = Math.abs(s);
      if (a > peak) peak = a;
    }
    const rms = Math.sqrt(sumSq / frames);
    if (rms > best.rms) best = { rms: Math.min(1, rms), peak: Math.min(1, peak) };
  }
  return best;
}

/**
 * Downmix interleaved S32 to a mono Int16 array, applying gain. Picks the
 * louder channel over the whole buffer (handles the unknown SEL channel).
 */
export function s32StereoToMonoS16(buf: Buffer, gain = 1, channels = 2): Int16Array {
  const frames = Math.floor(buf.length / (4 * channels));
  // Choose the channel carrying signal.
  let chosen = 0;
  let bestEnergy = -1;
  for (let c = 0; c < channels; c++) {
    let energy = 0;
    for (let f = 0; f < frames; f++) energy += Math.abs(buf.readInt32LE((f * channels + c) * 4));
    if (energy > bestEnergy) {
      bestEnergy = energy;
      chosen = c;
    }
  }
  const out = new Int16Array(frames);
  for (let f = 0; f < frames; f++) {
    // int32 full-scale (2^31) maps to 16-bit (2^15); then apply gain and clamp.
    const v = Math.round((buf.readInt32LE((f * channels + chosen) * 4) / 65536) * gain);
    out[f] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
  }
  return out;
}

/** Encode mono 16-bit PCM samples as a canonical 44-byte-header WAV file. */
export function encodeWavPcm16(samples: Int16Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // PCM fmt chunk size
  buf.writeUInt16LE(1, 20); // audio format = PCM
  buf.writeUInt16LE(1, 22); // channels = mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(samples[i], 44 + i * 2);
  return buf;
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
