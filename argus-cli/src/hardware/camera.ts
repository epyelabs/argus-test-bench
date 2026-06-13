/**
 * CSI/MIPI camera control via rpicam-apps (rpicam-hello / -still / -vid).
 *
 * Scope for this build is the two CSI cameras only; the UVC USB source is a
 * V4L2 device and will be added later. Detection and capture all shell out to
 * the rpicam-* tools, which own libcamera tuning/AE/AF for us.
 */
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { commandExists, run, runStream, type StreamHandle } from "../lib/exec.js";
import { isMock } from "../lib/platform.js";
import { ok, unavailable, type HalResult } from "./types.js";
import { RPICAM_LIST } from "../mocks/fixtures.js";

/** One sensor mode: a pixel format at a resolution and its max frame rate. */
export interface CameraMode {
  /** Pixel format token, e.g. "SRGGB10_CSI2P". */
  format: string;
  resolution: string;
  fps: number;
}

export interface Camera {
  index: number;
  name: string;
  /** Native max resolution from the header bracket, e.g. "1920x1080". */
  maxResolution?: string;
  /** Bit depth from the bracket, e.g. "12-bit". */
  bitDepth?: string;
  /** Bayer/colour token from the bracket, e.g. "RGGB" or "MONO". */
  bayer?: string;
  devicePath?: string;
  /** I2C node from the device path, e.g. "i2c@88000" — distinguishes the CSI ports. */
  bus?: string;
  modes: CameraMode[];
}

/**
 * Map a known fatal rpicam-vid stderr line to an actionable message.
 *
 * The Pi 5 / CM5 has no hardware video encoder, so rpicam-vid relies on libav
 * (software). The Lite image ships `rpicam-apps-lite`, which omits libav —
 * hence "Unrecognised codec libav" / "Unable to find an appropriate H.264 codec".
 */
export function encoderHint(line: string): string | null {
  if (/unrecognised codec|unrecognized codec/i.test(line)) {
    return "rpicam-apps was built without libav. Video needs it — install the full package: sudo apt install rpicam-apps";
  }
  if (/unable to find an appropriate .*codec/i.test(line)) {
    return "No H.264 encoder (the Pi 5/CM5 has none). Install the libav build: sudo apt install rpicam-apps";
  }
  if (/libav: unable to open video codec/i.test(line)) {
    return "libav could not open the video codec — check that rpicam-apps and its libav libraries match.";
  }
  return null;
}

/** Highest frame rate advertised across a camera's modes (0 if none). */
export function maxFps(cam: Camera): number {
  return cam.modes.reduce((mx, m) => Math.max(mx, m.fps), 0);
}

/** Distinct resolution strings advertised across a camera's modes. */
export function cameraResolutions(cam: Camera): string[] {
  const seen: string[] = [];
  for (const m of cam.modes) if (!seen.includes(m.resolution)) seen.push(m.resolution);
  return seen;
}

/** Group a camera's modes by pixel format, preserving first-seen order. */
export function modesByFormat(cam: Camera): { format: string; modes: CameraMode[] }[] {
  const groups: { format: string; modes: CameraMode[] }[] = [];
  for (const m of cam.modes) {
    let g = groups.find((x) => x.format === m.format);
    if (!g) {
      g = { format: m.format, modes: [] };
      groups.push(g);
    }
    g.modes.push(m);
  }
  return groups;
}

export interface StillOptions {
  index: number;
  width?: number;
  height?: number;
  out: string;
  /** Preview/settle time before capture (ms). rpicam default is 5000. */
  timeoutMs?: number;
}

export interface VideoOptions {
  index: number;
  /** 0 = record until stopped. */
  durationMs: number;
  width?: number;
  height?: number;
  fps?: number;
  out: string;
  /** libav container format. Default "mp4". */
  format?: string;
}

/** Pure parser for `rpicam-hello --list-cameras` output. */
export function parseCameraList(stdout: string): Camera[] {
  const cameras: Camera[] = [];
  const lines = stdout.split("\n");
  let current: Camera | null = null;
  let currentFormat = "";

  const header = /^\s*(\d+)\s*:\s*(\S+)\s*\[([^\]]*)\]\s*(?:\((.+)\))?/;
  // Resolution immediately followed by an "[ <n> fps" block — skips crop sizes.
  const modeRe = /(\d{3,5}x\d{3,5})\s*\[\s*([\d.]+)\s*fps/g;
  const formatRe = /'([^']+)'/;

  for (const line of lines) {
    const h = line.match(header);
    if (h) {
      if (current) cameras.push(current);
      const bracket = h[3] ?? "";
      const depth = bracket.match(/(\d+)-bit\s+(\S+)/);
      current = {
        index: parseInt(h[1], 10),
        name: h[2],
        maxResolution: bracket.match(/(\d{3,5}x\d{3,5})/)?.[1],
        bitDepth: depth ? `${depth[1]}-bit` : undefined,
        bayer: depth?.[2],
        devicePath: h[4],
        bus: h[4]?.match(/(i2c@\w+)/)?.[1],
        modes: [],
      };
      currentFormat = "";
      continue;
    }
    if (!current) continue;

    const fmt = line.match(formatRe);
    if (fmt) currentFormat = fmt[1];

    for (const m of line.matchAll(modeRe)) {
      current.modes.push({ format: currentFormat, resolution: m[1], fps: parseFloat(m[2]) });
    }
  }
  if (current) cameras.push(current);
  return cameras;
}

export async function listCameras(): Promise<HalResult<Camera[]>> {
  if (isMock()) return ok(parseCameraList(RPICAM_LIST));

  if (!(await commandExists("rpicam-hello"))) {
    return unavailable("rpicam-hello not found — install rpicam-apps.");
  }
  const res = await run("rpicam-hello", ["--list-cameras"], { timeoutMs: 10_000 });
  // rpicam returns non-zero with "No cameras available!" — treat as empty, not error.
  if (/no cameras available/i.test(res.stdout + res.stderr)) return ok([]);
  if (res.failed && !res.stdout.trim()) {
    return unavailable(res.stderr.trim() || "rpicam-hello failed");
  }
  return ok(parseCameraList(res.stdout));
}

export function defaultCaptureDir(): string {
  return process.env.ARGUS_CAPTURE_DIR ?? join(homedir(), "argus-captures");
}

export async function captureStill(opts: StillOptions): Promise<HalResult<{ path: string }>> {
  if (isMock()) return ok({ path: opts.out });

  if (!(await commandExists("rpicam-still"))) {
    return unavailable("rpicam-still not found — install rpicam-apps.");
  }
  await mkdir(dirOf(opts.out), { recursive: true });

  const args = ["--camera", String(opts.index), "-o", opts.out, "-t", String(opts.timeoutMs ?? 1500)];
  if (opts.width) args.push("--width", String(opts.width));
  if (opts.height) args.push("--height", String(opts.height));
  args.push("-n"); // no preview window (headless Lite OS)

  const res = await run("rpicam-still", args, { timeoutMs: (opts.timeoutMs ?? 1500) + 15_000 });
  if (res.failed) return unavailable(res.stderr.trim() || "capture failed");
  return ok({ path: opts.out });
}

/**
 * Start a recording. Returns immediately with a stream handle so the UI can
 * show an elapsed timer and stop it (SIGINT lets rpicam-vid finalize the file).
 */
export async function recordVideo(
  opts: VideoOptions,
  handlers: { onStderr?: (line: string) => void } = {},
): Promise<HalResult<{ path: string; handle: StreamHandle }>> {
  if (isMock()) {
    return ok({ path: opts.out, handle: mockStream(opts.durationMs) });
  }
  if (!(await commandExists("rpicam-vid"))) {
    return unavailable("rpicam-vid not found — install rpicam-apps.");
  }
  await mkdir(dirOf(opts.out), { recursive: true });

  // The Pi 5 / CM5 has no hardware H.264 encoder (rpicam-vid's default codec),
  // so we use the libav backend, which software-encodes straight into an MP4.
  const args = [
    "--camera",
    String(opts.index),
    "-t",
    String(opts.durationMs),
    "--codec",
    "libav",
    "--libav-format",
    opts.format ?? "mp4",
    "-o",
    opts.out,
    "-n",
  ];
  if (opts.fps) args.push("--framerate", String(opts.fps));
  if (opts.width) args.push("--width", String(opts.width));
  if (opts.height) args.push("--height", String(opts.height));

  const handle = runStream("rpicam-vid", args, { onStderr: handlers.onStderr });
  return ok({ path: opts.out, handle });
}

function dirOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "." : p.slice(0, i);
}

/** Fabricate a StreamHandle for mock mode that completes after the duration. */
function mockStream(durationMs: number): StreamHandle {
  let resolveDone!: () => void;
  const done = new Promise<import("../lib/exec.js").RunResult>((resolve) => {
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
