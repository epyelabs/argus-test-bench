import { useEffect, useRef, useState } from "react";
import { Text, useFocus, useInput } from "ink";
import Spinner from "ink-spinner";
import { StatusBadge } from "../../components/StatusBadge.js";
import { IMU } from "../../config/hardware.js";
import { signedFixed, toHexAddr } from "../../lib/format.js";
import { quatToEuler } from "../../lib/orientation.js";
import type { StreamHandle } from "../../lib/exec.js";
import {
  detectImu,
  streamImuData,
  type ImuDetect,
  type ImuSample,
} from "../../hardware/imu.js";
import type { HalResult } from "../../hardware/types.js";
import { PanelFrame } from "../PanelFrame.js";
import type { Hint } from "../../components/KeyHints.js";
import type { PanelProps } from "./types.js";

/** IMU — detection auto-runs; `d` starts a live stream, `s` stops; Enter opens the full screen. */
export function ImuPanel({ focusId, autoFocus, onOpen, onHints }: PanelProps) {
  const { isFocused } = useFocus({ id: focusId, autoFocus });
  const [result, setResult] = useState<HalResult<ImuDetect> | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [ready, setReady] = useState(false);
  const [sample, setSample] = useState<ImuSample | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const handleRef = useRef<StreamHandle | null>(null);

  useEffect(() => {
    void detectImu().then(setResult);
  }, []);

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

  // Leaving the panel (Tab away / drill in) kills the stream so no python3 lingers.
  useEffect(() => {
    if (!isFocused && streaming) stopStream();
  }, [isFocused, streaming]);

  const present = !!(result?.available && result.data.imuPresent);

  useEffect(() => {
    if (!isFocused) return;
    const hints: Hint[] = streaming
      ? [{ keys: "s", label: "stop" }]
      : present
        ? [
            { keys: "d", label: "live data" },
            { keys: "↵", label: "open" },
          ]
        : [{ keys: "↵", label: "open" }];
    onHints(hints);
  }, [isFocused, streaming, present, onHints]);

  useInput(
    (input, key) => {
      if (streaming) {
        if (input === "s") stopStream();
        return;
      }
      if (key.return) onOpen("imu");
      else if (input === "d") startStream();
    },
    { isActive: isFocused },
  );

  const euler = sample ? quatToEuler(sample.quat) : null;

  return (
    <PanelFrame title="IMU — BNO085" isFocused={isFocused}>
      {!result ? (
        <Text>
          <Spinner type="dots" /> Scanning I2C bus {IMU.i2cBus}…
        </Text>
      ) : !result.available ? (
        <Text color="red">⚠ {result.reason}</Text>
      ) : (
        <StatusBadge status={result.data.imuPresent ? "ok" : "error"}>
          BNO085 @ {IMU.addresses.map(toHexAddr).join(" / ")} —{" "}
          {result.data.imuPresent
            ? `present (${toHexAddr(result.data.imuAddress!)})`
            : "NOT found"}
        </StatusBadge>
      )}

      {streaming && !ready ? (
        <Text>
          <Spinner type="dots" /> Starting BNO085 reader…
        </Text>
      ) : null}

      {streaming && ready && sample && euler ? (
        <>
          <Text>
            <Text color="cyan">euler</Text> roll {signedFixed(euler.roll, 1)}° pitch{" "}
            {signedFixed(euler.pitch, 1)}° yaw {signedFixed(euler.yaw, 1)}°
          </Text>
          <Text>
            <Text color="cyan">accel</Text> x{signedFixed(sample.linaccel.x, 2)} y
            {signedFixed(sample.linaccel.y, 2)} z{signedFixed(sample.linaccel.z, 2)} m/s²
          </Text>
        </>
      ) : null}

      {!streaming && streamError ? <Text color="red">⚠ {streamError}</Text> : null}

      {!streaming && !streamError ? (
        <Text color={present ? "gray" : "yellow"}>
          {present ? "Press d for live motion data." : "Sensor not detected."}
        </Text>
      ) : null}
    </PanelFrame>
  );
}
