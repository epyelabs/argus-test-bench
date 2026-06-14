import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { LogView } from "../components/LogView.js";
import { Table } from "../components/Table.js";
import { fileStamp, formatDuration } from "../lib/format.js";
import type { StreamHandle } from "../lib/exec.js";
import {
  type Camera,
  captureStill,
  defaultCaptureDir,
  encoderHint,
  listAllCameras,
  maxFps,
  modesByFormat,
  recordVideo,
} from "../hardware/camera.js";
import { join } from "node:path";
import { noop, type ModuleStatus, type ModuleViewProps } from "../dashboard/moduleView.js";
import type { Hint } from "../components/KeyHints.js";

type Phase = "loading" | "pick" | "actions" | "settings" | "working" | "recording" | "result";

interface Settings {
  width: string;
  height: string;
  fps: string;
  durationSec: string;
}

const SETTINGS_FIELDS: (keyof Settings)[] = ["width", "height", "fps", "durationSec"];

export function CameraScreen({
  visible = true,
  active = true,
  onStatus = noop,
  onHints = noop,
  onExit,
  onBack,
}: ModuleViewProps) {
  const exit = onExit ?? onBack ?? noop;
  const [phase, setPhase] = useState<Phase>("loading");
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>({
    width: "",
    height: "",
    fps: "30",
    durationSec: "5",
  });
  const [activeField, setActiveField] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const handleRef = useRef<StreamHandle | null>(null);
  // Set when rpicam-vid prints a fatal encoder error so we don't report success.
  const recErrorRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await listAllCameras();
      if (!alive) return;
      if (r.available) {
        setCameras(r.data);
        setPhase("pick");
      } else {
        setError(r.reason);
        setPhase("result");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Stop any in-flight recording on (true) unmount — i.e. app exit.
  useEffect(() => () => handleRef.current?.stop(), []);

  // Recording elapsed timer; resolves to result when the process exits.
  useEffect(() => {
    if (phase !== "recording") return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - start) / 1000), 250);
    return () => clearInterval(timer);
  }, [phase]);

  const status = cameraStatus(phase, cameras.length, !!error);
  useEffect(() => {
    onStatus(status);
  }, [status.label, status.status, onStatus]);

  useEffect(() => {
    if (active) onHints(hintsFor(phase));
  }, [active, phase, onHints]);

  function appendLog(line: string) {
    setLog((l) => [...l, line]);
  }

  async function doSnapshot() {
    if (!camera) return;
    setPhase("working");
    setResult(null);
    const out = join(defaultCaptureDir(), `${captureSlug(camera)}-${stamp()}.jpg`);
    const r = await captureStill(camera, {
      out,
      width: numOrUndef(settings.width),
      height: numOrUndef(settings.height),
    });
    if (r.available) setResult(`Saved still → ${r.data.path}`);
    else setError(r.reason);
    setPhase("result");
  }

  async function doRecord(untilStop: boolean) {
    if (!camera) return;
    setResult(null);
    setError(null);
    const durationSec = untilStop ? 0 : Math.max(1, parseInt(settings.durationSec, 10) || 5);
    const out = join(defaultCaptureDir(), `${captureSlug(camera)}-${stamp()}.mp4`);
    recErrorRef.current = null;
    const r = await recordVideo(
      camera,
      {
        durationMs: durationSec * 1000,
        fps: numOrUndef(settings.fps),
        width: numOrUndef(settings.width),
        height: numOrUndef(settings.height),
        out,
      },
      {
        onStderr: (line) => {
          const t = line.trim();
          if (!t) return;
          appendLog(t);
          const hint = encoderHint(t);
          if (hint && !recErrorRef.current) recErrorRef.current = hint;
        },
      },
    );
    if (!r.available) {
      setError(r.reason);
      setPhase("result");
      return;
    }
    handleRef.current = r.data.handle;
    setElapsed(0);
    setPhase("recording");
    r.data.handle.done.then((res) => {
      handleRef.current = null;
      if (recErrorRef.current) setError(recErrorRef.current);
      else if (res.failed && res.notFound) setError(res.stderr);
      else setResult(`Saved video → ${r.data.path}`);
      setPhase("result");
    });
  }

  useInput(
    (input, key) => {
      if (phase === "recording") {
        // `s` stops recording; q/Esc leaves to the list but keeps recording.
        if (input === "s") handleRef.current?.stop();
        else if (input === "q" || key.escape) exit();
        return;
      }
      if (phase === "result") {
        if (key.return || input === " ") {
          setError(null);
          setResult(null);
          setPhase(camera ? "actions" : "pick");
        } else if (input === "q" || key.escape) {
          exit();
        }
        return;
      }
      if (phase === "settings") {
        if (key.escape) setPhase("actions");
        return;
      }
      // pick / actions: q or Esc steps back
      if (input === "q" || key.escape) {
        if (phase === "actions") setPhase("pick");
        else exit();
      }
    },
    { isActive: active },
  );

  if (!visible) return null;

  return (
    <Box flexDirection="column">
      {phase === "loading" ? (
        <Text>
          <Spinner type="dots" /> Listing cameras (rpicam + v4l2-ctl)…
        </Text>
      ) : null}

      {phase === "pick" ? (
        cameras.length === 0 ? (
          <Box flexDirection="column">
            <Text color="yellow">No cameras detected.</Text>
            <Text color="gray">CSI: check FFC seating / dtoverlay. USB: check the UVC cable.</Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            <Table
              columns={[
                { header: "#", cell: (c) => String(c.index) },
                { header: "Type", cell: (c) => c.kind.toUpperCase() },
                { header: "Name", cell: (c) => c.name },
                { header: "Resolution", cell: (c) => c.maxResolution ?? "—" },
                { header: "Max FPS", cell: (c) => (c.modes.length ? String(maxFps(c)) : "—") },
                {
                  header: "Where",
                  cell: (c) => (c.kind === "uvc" ? c.device ?? "—" : c.bus ?? "—"),
                },
              ]}
              rows={cameras}
            />
            <Box marginTop={1}>
              <SelectInput
                isFocused={active}
                items={cameras.map((c, i) => ({ label: cameraLabel(c), value: i }))}
                onSelect={(item) => {
                  setCamera(cameras[item.value] ?? null);
                  setPhase("actions");
                }}
              />
            </Box>
          </Box>
        )
      ) : null}

      {phase === "actions" && camera ? (
        <Box flexDirection="column">
          <Text>
            Selected <Text color="cyan">{camera.name}</Text>{" "}
            <Text color="gray">
              [{camera.kind.toUpperCase()}
              {camera.kind === "uvc" ? ` ${camera.device}` : ` cam${camera.index}`}
              {camera.usbId ? ` · ${camera.usbId}` : ""}]
            </Text>
          </Text>
          <Text color="gray">
            {camera.maxResolution ?? "—"} · up to {maxFps(camera)}fps
            {camera.kind === "csi"
              ? ` · ${camera.bitDepth ?? "?"} · ${camera.bayer ?? "?"} · ${camera.bus ?? "?"}`
              : ""}
          </Text>
          <Box
            flexDirection="column"
            marginTop={1}
            borderStyle="round"
            borderColor="gray"
            paddingX={1}
          >
            <Text color="gray">{camera.kind === "uvc" ? "Formats" : "Sensor modes"}</Text>
            {modesByFormat(camera).map((g) => (
              <Text key={g.format}>
                <Text color="cyan">{g.format}</Text>{" "}
                {g.modes.map((m) => `${m.resolution}@${m.fps}`).join("  ")}
              </Text>
            ))}
          </Box>
          <Text color="gray">
            res {settings.width || "full"}×{settings.height || "full"}  ·  {settings.fps}fps  ·{" "}
            {settings.durationSec}s
          </Text>
          <Box marginTop={1}>
            <SelectInput
              isFocused={active}
              items={[
                { label: "📸  Snapshot", value: "snap" },
                { label: `🎬  Record ${settings.durationSec}s`, value: "rec" },
                { label: "🎬  Record until stopped", value: "recstop" },
                { label: "⚙   Settings (resolution / fps / duration)", value: "settings" },
                { label: "←  Back to camera list", value: "back" },
              ]}
              onSelect={(item) => {
                if (item.value === "snap") void doSnapshot();
                else if (item.value === "rec") void doRecord(false);
                else if (item.value === "recstop") void doRecord(true);
                else if (item.value === "settings") {
                  setActiveField(0);
                  setPhase("settings");
                } else setPhase("pick");
              }}
            />
          </Box>
        </Box>
      ) : null}

      {phase === "settings" ? (
        <Box flexDirection="column">
          <Text color="gray">Enter to advance; blank width/height = native full resolution.</Text>
          {SETTINGS_FIELDS.map((field, i) => (
            <Box key={field}>
              <Text color={i === activeField ? "cyan" : "gray"}>{field.padEnd(12)} </Text>
              <TextInput
                value={settings[field]}
                focus={active && i === activeField}
                onChange={(v) => setSettings((s) => ({ ...s, [field]: v.replace(/[^0-9]/g, "") }))}
                onSubmit={() => {
                  if (activeField < SETTINGS_FIELDS.length - 1) setActiveField(activeField + 1);
                  else setPhase("actions");
                }}
              />
            </Box>
          ))}
        </Box>
      ) : null}

      {phase === "working" ? (
        <Text>
          <Spinner type="dots" /> Capturing…
        </Text>
      ) : null}

      {phase === "recording" ? (
        <Box flexDirection="column">
          <Text color="red">● REC </Text>
          <Text>
            {camera?.name} · {formatDuration(elapsed)} elapsed
          </Text>
          <Box marginTop={1}>
            <LogView lines={log} title="rpicam-vid" />
          </Box>
        </Box>
      ) : null}

      {phase === "result" ? (
        <Box flexDirection="column">
          {result ? <Text color="green">✓ {result}</Text> : null}
          {error ? <Text color="red">⚠ {error}</Text> : null}
          {log.length ? (
            <Box marginTop={1}>
              <LogView lines={log} title="rpicam-vid" />
            </Box>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}

function cameraStatus(phase: Phase, count: number, hasError: boolean): ModuleStatus {
  if (phase === "loading") return { label: "listing", status: "busy" };
  if (phase === "working") return { label: "capturing", status: "busy" };
  if (phase === "recording") return { label: "REC", status: "error" };
  if (hasError) return { label: "error", status: "error" };
  if (count === 0) return { label: "no cameras", status: "warn" };
  return { label: `${count} source${count === 1 ? "" : "s"}`, status: "ok" };
}

function hintsFor(phase: Phase): Hint[] {
  switch (phase) {
    case "recording":
      return [
        { keys: "s", label: "stop" },
        { keys: "q/Esc", label: "back (keep running)" },
      ];
    case "result":
      return [
        { keys: "↵", label: "continue" },
        { keys: "q/Esc", label: "back" },
      ];
    case "settings":
      return [
        { keys: "↵", label: "next field" },
        { keys: "Esc", label: "done" },
      ];
    default:
      return [
        { keys: "↑↓", label: "move" },
        { keys: "↵", label: "select" },
        { keys: "q/Esc", label: "back" },
      ];
  }
}

function numOrUndef(s: string): number | undefined {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function stamp(): string {
  return fileStamp(new Date().toISOString());
}

/** Filesystem-safe name for a capture, e.g. "imx290-cam0" or "HD_USB_Camera-video8". */
function captureSlug(camera: Camera): string {
  const name = camera.name.replace(/[^0-9A-Za-z]+/g, "_").replace(/^_+|_+$/g, "");
  const tag = camera.kind === "uvc" ? camera.device?.split("/").pop() : `cam${camera.index}`;
  return `${name}-${tag}`;
}

/** Picker label that disambiguates sources (bus for CSI, device node for UVC). */
function cameraLabel(camera: Camera): string {
  const where = camera.kind === "uvc" ? camera.device : camera.bus;
  return `${camera.kind.toUpperCase()} · ${camera.name}${where ? ` (${where})` : ""}`;
}
