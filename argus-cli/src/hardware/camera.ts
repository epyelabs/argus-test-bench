/**
 * Camera control for both source types on the board:
 *   - CSI/MIPI cameras via rpicam-apps (rpicam-hello / -still / -vid).
 *   - UVC USB cameras via V4L2 — enumerated with `v4l2-ctl`, captured with
 *     `ffmpeg` (libcamera/rpicam does not drive UVC devices).
 * Capture functions branch on `Camera.kind`; the screen shows both in one list.
 */
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { commandExists, run, runStream, type StreamHandle } from "../lib/exec.js";
import { isMock } from "../lib/platform.js";
import { ok, unavailable, type HalResult } from "./types.js";
import { LSUSB, RPICAM_LIST, V4L2_FORMATS, V4L2_LIST_DEVICES } from "../mocks/fixtures.js";

/** One sensor mode: a pixel format at a resolution and its max frame rate. */
export interface CameraMode {
  /** Pixel format token, e.g. "SRGGB10_CSI2P" (CSI) or "MJPG"/"YUYV" (UVC). */
  format: string;
  resolution: string;
  fps: number;
}

export interface Camera {
  /** "csi" = rpicam/libcamera; "uvc" = V4L2 USB webcam. */
  kind: "csi" | "uvc";
  index: number;
  name: string;
  /** Native max resolution, e.g. "1920x1080". */
  maxResolution?: string;
  /** Bit depth from the bracket, e.g. "12-bit" (CSI only). */
  bitDepth?: string;
  /** Bayer/colour token from the bracket, e.g. "RGGB" or "MONO" (CSI only). */
  bayer?: string;
  devicePath?: string;
  /** I2C node from the device path, e.g. "i2c@88000" — distinguishes the CSI ports. */
  bus?: string;
  /** V4L2 capture node for UVC, e.g. "/dev/video8". */
  device?: string;
  /** USB vendor:product for UVC, e.g. "32e4:2210". */
  usbId?: string;
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
  // ffmpeg / V4L2 (UVC) failures.
  if (/device or resource busy/i.test(line)) {
    return "Camera is busy — another process is using it. Close it and retry.";
  }
  if (/no such file or directory|cannot open|inappropriate ioctl/i.test(line)) {
    return "Could not open the V4L2 device — check the camera is connected and the node is correct.";
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
  width?: number;
  height?: number;
  out: string;
  /** Preview/settle time before capture (ms). rpicam default is 5000. */
  timeoutMs?: number;
}

export interface VideoOptions {
  /** 0 = record until stopped. */
  durationMs: number;
  width?: number;
  height?: number;
  fps?: number;
  out: string;
  /** libav container format (CSI). Default "mp4". */
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
        kind: "csi",
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

// --- UVC (V4L2 USB cameras) --------------------------------------------------

/** Pure parser for `v4l2-ctl --list-devices` → devices with their /dev/videoN nodes. */
export function parseV4l2Devices(stdout: string): { name: string; nodes: string[] }[] {
  const devices: { name: string; nodes: string[] }[] = [];
  let current: { name: string; nodes: string[] } | null = null;
  for (const line of stdout.split("\n")) {
    if (line.trim() === "") continue;
    if (!/^\s/.test(line)) {
      // Header line, e.g. "HD USB Camera: HD USB Camera (usb-...):"
      const beforeParen = line.includes(" (") ? line.slice(0, line.indexOf(" (")) : line.replace(/:\s*$/, "");
      const name = beforeParen.includes(": ")
        ? beforeParen.slice(beforeParen.lastIndexOf(": ") + 2).trim()
        : beforeParen.trim();
      current = { name, nodes: [] };
      devices.push(current);
    } else if (current) {
      const node = line.trim();
      if (/^\/dev\/video\d+$/.test(node)) current.nodes.push(node);
    }
  }
  return devices;
}

/**
 * Pure parser for `v4l2-ctl -d <node> --list-formats-ext`.
 * Returns one mode per (format, resolution) with the max fps. Empty for the
 * metadata-only node, which is how we pick the real capture node.
 */
export function parseV4l2Formats(stdout: string): CameraMode[] {
  const modes: CameraMode[] = [];
  const index = new Map<string, number>();
  let format = "";
  let size = "";
  for (const line of stdout.split("\n")) {
    const f = line.match(/\[\d+\]:\s*'([^']+)'/);
    if (f) {
      format = f[1];
      size = "";
      continue;
    }
    const s = line.match(/Size:\s*Discrete\s*(\d{2,5}x\d{2,5})/);
    if (s) {
      size = s[1];
      continue;
    }
    const iv = line.match(/\(([\d.]+)\s*fps\)/);
    if (iv && format && size) {
      const fps = parseFloat(iv[1]);
      const key = `${format} ${size}`;
      const at = index.get(key);
      if (at === undefined) {
        index.set(key, modes.length);
        modes.push({ format, resolution: size, fps });
      } else if (fps > modes[at].fps) {
        modes[at].fps = fps;
      }
    }
  }
  return modes;
}

/** Largest resolution (by pixel area) among a set of modes. */
function largestResolution(modes: CameraMode[]): string | undefined {
  let best: string | undefined;
  let bestArea = -1;
  for (const m of modes) {
    const [w, h] = m.resolution.split("x").map(Number);
    const area = w * h;
    if (area > bestArea) {
      bestArea = area;
      best = m.resolution;
    }
  }
  return best;
}

/** Best-effort USB id from `lsusb` output for a device matched by name. */
export function matchUsbId(lsusbStdout: string, name: string): string | undefined {
  for (const line of lsusbStdout.split("\n")) {
    if (name && line.includes(name)) {
      const m = line.match(/ID\s+([0-9a-f]{4}:[0-9a-f]{4})/i);
      if (m) return m[1];
    }
  }
  return undefined;
}

export async function listUvcCameras(): Promise<HalResult<Camera[]>> {
  if (isMock()) {
    const cams = parseV4l2Devices(V4L2_LIST_DEVICES).map((d, i) =>
      buildUvc(d.name, "/dev/video8", parseV4l2Formats(V4L2_FORMATS), matchUsbId(LSUSB, d.name), i),
    );
    return ok(cams);
  }

  if (!(await commandExists("v4l2-ctl"))) {
    return unavailable("v4l2-ctl not found — install v4l-utils.");
  }
  const list = await run("v4l2-ctl", ["--list-devices"]);
  if (list.failed && !list.stdout.trim()) return ok([]); // no UVC devices

  const lsusb = await run("lsusb");
  const cams: Camera[] = [];
  for (const dev of parseV4l2Devices(list.stdout)) {
    // The capture node is the first video node that reports capture formats
    // (the others are metadata-only).
    let captureNode: string | undefined;
    let modes: CameraMode[] = [];
    for (const node of dev.nodes) {
      const fmt = await run("v4l2-ctl", ["-d", node, "--list-formats-ext"]);
      const m = parseV4l2Formats(fmt.stdout);
      if (m.length > 0) {
        captureNode = node;
        modes = m;
        break;
      }
    }
    if (!captureNode) continue;
    cams.push(buildUvc(dev.name, captureNode, modes, matchUsbId(lsusb.stdout, dev.name), cams.length));
  }
  return ok(cams);
}

function buildUvc(
  name: string,
  device: string,
  modes: CameraMode[],
  usbId: string | undefined,
  fallbackIndex: number,
): Camera {
  const nodeNum = device.match(/(\d+)$/)?.[1];
  return {
    kind: "uvc",
    index: nodeNum ? parseInt(nodeNum, 10) : fallbackIndex,
    name,
    device,
    usbId,
    maxResolution: largestResolution(modes),
    modes,
  };
}

/** CSI cameras (rpicam) + UVC cameras (V4L2), merged into one list. */
export async function listAllCameras(): Promise<HalResult<Camera[]>> {
  const [csi, uvc] = await Promise.all([listCameras(), listUvcCameras()]);
  const cameras: Camera[] = [];
  const reasons: string[] = [];
  if (csi.available) cameras.push(...csi.data);
  else reasons.push(csi.reason);
  if (uvc.available) cameras.push(...uvc.data);
  else reasons.push(uvc.reason);

  // Only fail if we found nothing AND something went wrong probing.
  if (cameras.length === 0 && reasons.length) return unavailable(reasons.join(" / "));
  return ok(cameras);
}

export async function captureStill(
  camera: Camera,
  opts: StillOptions,
): Promise<HalResult<{ path: string }>> {
  if (isMock()) return ok({ path: opts.out });
  if (camera.kind === "uvc") return captureStillUvc(camera, opts);

  if (!(await commandExists("rpicam-still"))) {
    return unavailable("rpicam-still not found — install rpicam-apps.");
  }
  await mkdir(dirOf(opts.out), { recursive: true });

  const args = ["--camera", String(camera.index), "-o", opts.out, "-t", String(opts.timeoutMs ?? 1500)];
  if (opts.width) args.push("--width", String(opts.width));
  if (opts.height) args.push("--height", String(opts.height));
  args.push("-n"); // no preview window (headless Lite OS)

  const res = await run("rpicam-still", args, { timeoutMs: (opts.timeoutMs ?? 1500) + 15_000 });
  if (res.failed) return unavailable(res.stderr.trim() || "capture failed");
  return ok({ path: opts.out });
}

/**
 * Start a recording. Returns immediately with a stream handle so the UI can
 * show an elapsed timer and stop it (SIGINT lets the encoder finalize the file).
 */
export async function recordVideo(
  camera: Camera,
  opts: VideoOptions,
  handlers: { onStderr?: (line: string) => void } = {},
): Promise<HalResult<{ path: string; handle: StreamHandle }>> {
  if (isMock()) {
    return ok({ path: opts.out, handle: mockStream(opts.durationMs) });
  }
  if (camera.kind === "uvc") {
    if (!(await commandExists("ffmpeg"))) return unavailable("ffmpeg not found — install ffmpeg.");
    await mkdir(dirOf(opts.out), { recursive: true });
    return recordVideoUvc(camera, opts, handlers);
  }

  if (!(await commandExists("rpicam-vid"))) {
    return unavailable("rpicam-vid not found — install rpicam-apps.");
  }
  await mkdir(dirOf(opts.out), { recursive: true });

  // The Pi 5 / CM5 has no hardware H.264 encoder (rpicam-vid's default codec),
  // so we use the libav backend, which software-encodes straight into an MP4.
  const args = [
    "--camera",
    String(camera.index),
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

// --- UVC capture (ffmpeg over V4L2) ------------------------------------------

/** Whether to request MJPG input — preferred since it unlocks the high-res modes. */
function uvcUsesMjpeg(camera: Camera): boolean {
  return camera.modes.some((m) => /mjpe?g/i.test(m.format));
}

/** Resolution to request: explicit w×h if given, else the camera's largest mode. */
function uvcVideoSize(camera: Camera, opts: { width?: number; height?: number }): string | undefined {
  if (opts.width && opts.height) return `${opts.width}x${opts.height}`;
  return camera.maxResolution;
}

async function captureStillUvc(
  camera: Camera,
  opts: StillOptions,
): Promise<HalResult<{ path: string }>> {
  if (!(await commandExists("ffmpeg"))) return unavailable("ffmpeg not found — install ffmpeg.");
  await mkdir(dirOf(opts.out), { recursive: true });

  const args = ["-hide_banner", "-loglevel", "error", "-f", "v4l2"];
  if (uvcUsesMjpeg(camera)) args.push("-input_format", "mjpeg");
  const size = uvcVideoSize(camera, opts);
  if (size) args.push("-video_size", size);
  args.push("-i", camera.device!, "-frames:v", "1", "-y", opts.out);

  const res = await run("ffmpeg", args, { timeoutMs: 20_000 });
  if (res.failed) return unavailable(res.stderr.trim().split("\n").pop() || "ffmpeg capture failed");
  return ok({ path: opts.out });
}

function recordVideoUvc(
  camera: Camera,
  opts: VideoOptions,
  handlers: { onStderr?: (line: string) => void },
): HalResult<{ path: string; handle: StreamHandle }> {
  const args = ["-hide_banner", "-f", "v4l2"];
  if (uvcUsesMjpeg(camera)) args.push("-input_format", "mjpeg");
  if (opts.fps) args.push("-framerate", String(opts.fps));
  const size = uvcVideoSize(camera, opts);
  if (size) args.push("-video_size", size);
  args.push("-i", camera.device!);
  if (opts.durationMs > 0) args.push("-t", String(opts.durationMs / 1000));
  // Software H.264 (no HW encoder on Pi 5); ultrafast keeps up at capture rate.
  args.push("-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-y", opts.out);

  const handle = runStream("ffmpeg", args, { onStderr: handlers.onStderr });
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
