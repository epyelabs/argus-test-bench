import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import { Header } from "../components/Header.js";
import { KeyHints } from "../components/KeyHints.js";
import { LevelMeter } from "../components/LevelMeter.js";
import { Table } from "../components/Table.js";
import { join } from "node:path";
import { fileStamp, formatDuration } from "../lib/format.js";
import type { StreamHandle } from "../lib/exec.js";
import { defaultCaptureDir } from "../hardware/camera.js";
import {
  type AudioLevel,
  type MicDevice,
  listMics,
  micGain,
  recordAudio,
  startMeter,
} from "../hardware/mic.js";

type Phase = "loading" | "pick" | "menu" | "meter" | "recording" | "result";

export function MicScreen({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [mics, setMics] = useState<MicDevice[]>([]);
  const [mic, setMic] = useState<MicDevice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [level, setLevel] = useState<AudioLevel>({ rms: 0, peak: 0 });
  const [elapsed, setElapsed] = useState(0);
  const handleRef = useRef<StreamHandle | null>(null);

  useEffect(() => {
    let active = true;
    void listMics().then((r) => {
      if (!active) return;
      if (r.available) {
        setMics(r.data);
        setPhase("pick");
      } else {
        setError(r.reason);
        setPhase("result");
      }
    });
    return () => {
      active = false;
      handleRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - start) / 1000), 250);
    return () => clearInterval(timer);
  }, [phase]);

  function startMetering() {
    if (!mic) return;
    setLevel({ rms: 0, peak: 0 });
    handleRef.current = startMeter({ card: mic.card, device: mic.device }, setLevel);
    setPhase("meter");
    handleRef.current.done.then(() => {
      handleRef.current = null;
    });
  }

  async function startRecording(seconds: number) {
    if (!mic) return;
    setError(null);
    setResult(null);
    const out = join(defaultCaptureDir(), `mic-card${mic.card}-${fileStamp(new Date().toISOString())}.wav`);
    const r = await recordAudio({ card: mic.card, device: mic.device, seconds, out });
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
      if (res.failed && res.stderr) setError(res.stderr);
      else setResult(`Saved recording → ${r.data.path}`);
      setPhase("result");
    });
  }

  useInput((input, key) => {
    if (phase === "meter") {
      if (input === "s" || input === "q" || key.escape) {
        handleRef.current?.stop();
        setPhase("menu");
      }
      return;
    }
    if (phase === "recording") {
      if (input === "s" || key.escape) handleRef.current?.stop();
      return;
    }
    if (phase === "result") {
      if (key.return || input === " ") {
        setError(null);
        setResult(null);
        setPhase(mic ? "menu" : "pick");
      } else if (input === "q" || key.escape) onBack();
      return;
    }
    if (input === "q" || key.escape) {
      if (phase === "menu") setPhase("pick");
      else onBack();
    }
  });

  return (
    <Box flexDirection="column">
      <Header title="Microphone — I2S MEMS" />
      <Box flexDirection="column" paddingX={1}>
        {phase === "loading" ? (
          <Text>
            <Spinner type="dots" /> Listing capture devices (arecord -l)…
          </Text>
        ) : null}

        {phase === "pick" ? (
          mics.length === 0 ? (
            <Box flexDirection="column">
              <Text color="yellow">No ALSA capture devices found.</Text>
              <Text color="gray">Check the I2S dtoverlay for the SPH0645.</Text>
            </Box>
          ) : (
            <Box flexDirection="column">
              <Table
                columns={[
                  { header: "Card", cell: (d) => `${d.card}:${d.device}` },
                  { header: "Id", cell: (d) => d.cardId },
                  { header: "Name", cell: (d) => d.cardName },
                  { header: "Mic?", cell: (d) => (d.isMic ? "✓" : "") },
                ]}
                rows={mics}
              />
              <Box marginTop={1}>
                <SelectInput
                  items={mics.map((d) => ({
                    label: `card ${d.card},${d.device} — ${d.cardName}${d.isMic ? "  (I2S mic)" : ""}`,
                    value: `${d.card}:${d.device}`,
                  }))}
                  initialIndex={Math.max(0, mics.findIndex((d) => d.isMic))}
                  onSelect={(item) => {
                    const [c, dv] = String(item.value).split(":").map(Number);
                    setMic(mics.find((d) => d.card === c && d.device === dv) ?? null);
                    setPhase("menu");
                  }}
                />
              </Box>
            </Box>
          )
        ) : null}

        {phase === "menu" && mic ? (
          <Box flexDirection="column">
            <Text>
              Selected <Text color="cyan">{mic.cardName}</Text> (card {mic.card},{mic.device})
            </Text>
            <Box marginTop={1}>
              <SelectInput
                items={[
                  { label: "📊  Live level meter", value: "meter" },
                  { label: "⏺   Record 5s to WAV", value: "rec5" },
                  { label: "⏺   Record 10s to WAV", value: "rec10" },
                  { label: "←  Back to device list", value: "back" },
                ]}
                onSelect={(item) => {
                  if (item.value === "meter") startMetering();
                  else if (item.value === "rec5") void startRecording(5);
                  else if (item.value === "rec10") void startRecording(10);
                  else setPhase("pick");
                }}
              />
            </Box>
          </Box>
        ) : null}

        {phase === "meter" ? (
          <Box flexDirection="column">
            <Text color="cyan">
              Live input level — make some noise{" "}
              <Text color="gray">(gain ×{micGain()}, set ARGUS_MIC_GAIN to tune)</Text>
            </Text>
            <Box marginTop={1} flexDirection="column">
              <LevelMeter level={level.rms} peak={level.peak} label="RMS " width={44} />
            </Box>
          </Box>
        ) : null}

        {phase === "recording" ? (
          <Box flexDirection="column">
            <Text color="red">● REC</Text>
            <Text>{formatDuration(elapsed)} elapsed</Text>
          </Box>
        ) : null}

        {phase === "result" ? (
          <Box flexDirection="column">
            {result ? <Text color="green">✓ {result}</Text> : null}
            {error ? <Text color="red">⚠ {error}</Text> : null}
          </Box>
        ) : null}
      </Box>
      <KeyHints hints={hintsFor(phase)} />
    </Box>
  );
}

function hintsFor(phase: Phase) {
  switch (phase) {
    case "meter":
      return [{ keys: "s", label: "stop" }];
    case "recording":
      return [{ keys: "s", label: "stop early" }];
    case "result":
      return [
        { keys: "↵", label: "continue" },
        { keys: "q", label: "back" },
      ];
    default:
      return [
        { keys: "↑↓", label: "move" },
        { keys: "↵", label: "select" },
        { keys: "q", label: "back" },
      ];
  }
}
