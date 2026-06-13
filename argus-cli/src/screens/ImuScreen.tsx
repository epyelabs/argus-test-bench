import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { Header } from "../components/Header.js";
import { KeyHints } from "../components/KeyHints.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { IMU } from "../config/hardware.js";
import { signedFixed, toHexAddr } from "../lib/format.js";
import { quatToEuler } from "../lib/orientation.js";
import type { StreamHandle } from "../lib/exec.js";
import { detectImu, streamImuData, type ImuDetect, type ImuSample } from "../hardware/imu.js";
import type { HalResult } from "../hardware/types.js";

export function ImuScreen({ onBack }: { onBack: () => void }) {
  const [result, setResult] = useState<HalResult<ImuDetect> | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [ready, setReady] = useState(false);
  const [sample, setSample] = useState<ImuSample | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const handleRef = useRef<StreamHandle | null>(null);

  function scan() {
    setResult(null);
    void detectImu().then(setResult);
  }

  useEffect(scan, []);

  // Always stop the helper process on unmount.
  useEffect(() => () => handleRef.current?.stop(), []);

  function stopStream() {
    handleRef.current?.stop();
    handleRef.current = null;
    setStreaming(false);
    setReady(false);
  }

  function startStream() {
    if (!result?.available || !result.data.imuPresent || streaming) return;
    const address = result.data.imuAddress ?? IMU.addresses[0];
    setStreamError(null);
    setSample(null);
    setReady(false);
    setStreaming(true);
    handleRef.current = streamImuData(address, {
      onReady: () => setReady(true),
      onSample: (s) => setSample(s),
      onError: (msg) => {
        setStreamError(msg);
        setStreaming(false);
      },
    });
  }

  useInput((input, key) => {
    if (streaming) {
      if (input === "s" || input === "q" || key.escape) stopStream();
      return;
    }
    if (input === "q" || key.escape) {
      handleRef.current?.stop();
      onBack();
    } else if (input === "r") scan();
    else if (input === "d") startStream();
  });

  const present = result?.available && result.data.imuPresent;
  const euler = sample ? quatToEuler(sample.quat) : null;

  return (
    <Box flexDirection="column">
      <Header title="IMU — BNO085" />
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Box flexDirection="column">
          <Text bold color="cyan">
            Detection <Text color="gray">(i2cdetect -y {IMU.i2cBus})</Text>
          </Text>
          {!result ? (
            <Text>
              <Spinner type="dots" /> Scanning I2C bus {IMU.i2cBus}…
            </Text>
          ) : !result.available ? (
            <Text color="red">⚠ {result.reason}</Text>
          ) : (
            <Box flexDirection="column">
              <StatusBadge status={result.data.imuPresent ? "ok" : "error"}>
                BNO085 @ {IMU.addresses.map(toHexAddr).join(" / ")} —{" "}
                {result.data.imuPresent
                  ? `present (found at ${toHexAddr(result.data.imuAddress!)})`
                  : "NOT found"}
              </StatusBadge>
              <StatusBadge status={result.data.bmsPresent ? "ok" : "unknown"}>
                BMS (MP2696) @ {toHexAddr(IMU.bmsAddress)} —{" "}
                {result.data.bmsPresent ? "present (shares bus)" : "not seen"}
              </StatusBadge>
            </Box>
          )}
        </Box>

        <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
          <Text color="gray">Live motion data (rotation vector + linear acceleration)</Text>

          {streaming && !ready ? (
            <Text>
              <Spinner type="dots" /> Starting BNO085 reader…
            </Text>
          ) : null}

          {streaming && ready && sample ? (
            <Box flexDirection="column">
              <Text>
                <Text color="cyan">quat </Text>
                r{signedFixed(sample.quat.r, 3)} i{signedFixed(sample.quat.i, 3)} j
                {signedFixed(sample.quat.j, 3)} k{signedFixed(sample.quat.k, 3)}
              </Text>
              <Text>
                <Text color="cyan">euler</Text> roll {signedFixed(euler!.roll, 1)}° pitch{" "}
                {signedFixed(euler!.pitch, 1)}° yaw {signedFixed(euler!.yaw, 1)}°
              </Text>
              <Text>
                <Text color="cyan">accel</Text> x{signedFixed(sample.linaccel.x, 2)} y
                {signedFixed(sample.linaccel.y, 2)} z{signedFixed(sample.linaccel.z, 2)} m/s²
              </Text>
            </Box>
          ) : null}

          {!streaming && streamError ? <Text color="red">⚠ {streamError}</Text> : null}

          {!streaming && !streamError ? (
            <Text color={present ? "gray" : "yellow"}>
              {present ? "Press d to start the live reader." : "Sensor not detected — cannot stream."}
            </Text>
          ) : null}
        </Box>
      </Box>
      <KeyHints hints={streaming ? STREAM_HINTS : idleHints(!!present)} />
    </Box>
  );
}

const STREAM_HINTS = [{ keys: "s", label: "stop" }];

function idleHints(present: boolean) {
  const hints = [{ keys: "r", label: "rescan" }];
  if (present) hints.push({ keys: "d", label: "live data" });
  hints.push({ keys: "q", label: "back" });
  return hints;
}
