import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { Header } from "../components/Header.js";
import { KeyHints } from "../components/KeyHints.js";
import { LogView } from "../components/LogView.js";
import { Table } from "../components/Table.js";
import { fileStamp, formatDuration } from "../lib/format.js";
import type { StreamHandle } from "../lib/exec.js";
import {
  type Camera,
  captureStill,
  defaultCaptureDir,
  listCameras,
  modesByFormat,
  recordVideo,
} from "../hardware/camera.js";
import { join } from "node:path";

type Phase = "loading" | "pick" | "actions" | "settings" | "working" | "recording" | "result";

interface Settings {
  width: string;
  height: string;
  fps: string;
  durationSec: string;
}

const SETTINGS_FIELDS: (keyof Settings)[] = ["width", "height", "fps", "durationSec"];

export function CameraScreen({ onBack }: { onBack: () => void }) {
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

  useEffect(() => {
    let active = true;
    void (async () => {
      const r = await listCameras();
      if (!active) return;
      if (r.available) {
        setCameras(r.data);
        setPhase("pick");
      } else {
        setError(r.reason);
        setPhase("result");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Recording elapsed timer; resolves to result when the process exits.
  useEffect(() => {
    if (phase !== "recording") return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - start) / 1000), 250);
    return () => clearInterval(timer);
  }, [phase]);

  function appendLog(line: string) {
    setLog((l) => [...l, line]);
  }

  async function doSnapshot() {
    if (!camera) return;
    setPhase("working");
    setResult(null);
    const out = join(defaultCaptureDir(), `${camera.name}-cam${camera.index}-${stamp()}.jpg`);
    const r = await captureStill({
      index: camera.index,
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
    const out = join(defaultCaptureDir(), `${camera.name}-cam${camera.index}-${stamp()}.h264`);
    const r = await recordVideo(
      {
        index: camera.index,
        durationMs: durationSec * 1000,
        fps: numOrUndef(settings.fps),
        width: numOrUndef(settings.width),
        height: numOrUndef(settings.height),
        out,
      },
      { onStderr: (line) => line.trim() && appendLog(line.trim()) },
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
      if (res.failed && res.notFound) setError(res.stderr);
      else setResult(`Saved video → ${r.data.path}`);
      setPhase("result");
    });
  }

  useInput((input, key) => {
    if (phase === "recording") {
      if (input === "s" || key.escape) handleRef.current?.stop();
      return;
    }
    if (phase === "result") {
      if (key.return || input === " ") {
        setError(null);
        setResult(null);
        setPhase(camera ? "actions" : "pick");
      } else if (input === "q" || key.escape) {
        onBack();
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
      else onBack();
    }
  });

  return (
    <Box flexDirection="column">
      <Header title="Cameras (CSI)" />
      <Box flexDirection="column" paddingX={1}>
        {phase === "loading" ? (
          <Text>
            <Spinner type="dots" /> Listing cameras (rpicam-hello)…
          </Text>
        ) : null}

        {phase === "pick" ? (
          cameras.length === 0 ? (
            <Box flexDirection="column">
              <Text color="yellow">No CSI cameras detected.</Text>
              <Text color="gray">Check the FFC seating and camera dtoverlay.</Text>
            </Box>
          ) : (
            <Box flexDirection="column">
              <Table
                columns={[
                  { header: "#", cell: (c) => String(c.index) },
                  { header: "Sensor", cell: (c) => c.name },
                  { header: "Resolution", cell: (c) => c.maxResolution ?? "?" },
                  { header: "Depth", cell: (c) => c.bitDepth ?? "?" },
                  { header: "Bayer", cell: (c) => c.bayer ?? "?" },
                  { header: "Bus", cell: (c) => c.bus ?? "?" },
                ]}
                rows={cameras}
              />
              <Box marginTop={1}>
                <SelectInput
                  items={cameras.map((c) => ({
                    label: `${c.index}: ${c.name}${c.bus ? ` (${c.bus})` : ""}`,
                    value: c.index,
                  }))}
                  onSelect={(item) => {
                    setCamera(cameras.find((c) => c.index === item.value) ?? null);
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
              Selected <Text color="cyan">{camera.name}</Text> (camera {camera.index})
            </Text>
            <Text color="gray">
              {camera.maxResolution ?? "?"} · {camera.bitDepth ?? "?"} · {camera.bayer ?? "?"} ·{" "}
              {camera.bus ?? "?"}
            </Text>
            <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
              <Text color="gray">Sensor modes</Text>
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
                  focus={i === activeField}
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

      <KeyHints hints={hintsFor(phase)} />
    </Box>
  );
}

function hintsFor(phase: Phase) {
  switch (phase) {
    case "recording":
      return [{ keys: "s", label: "stop" }];
    case "result":
      return [
        { keys: "↵", label: "continue" },
        { keys: "q", label: "back" },
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
        { keys: "q", label: "back" },
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
