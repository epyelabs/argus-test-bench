import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { Header } from "../components/Header.js";
import { KeyHints } from "../components/KeyHints.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { IMU } from "../config/hardware.js";
import { toHexAddr } from "../lib/format.js";
import { detectImu, type ImuDetect } from "../hardware/imu.js";
import type { HalResult } from "../hardware/types.js";

export function ImuScreen({ onBack }: { onBack: () => void }) {
  const [result, setResult] = useState<HalResult<ImuDetect> | null>(null);

  function scan() {
    setResult(null);
    void detectImu().then(setResult);
  }

  useEffect(scan, []);

  useInput((input, key) => {
    if (input === "q" || key.escape) onBack();
    else if (input === "r") scan();
  });

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
              <Text color="gray">
                addresses on bus:{" "}
                {result.data.addresses.length
                  ? result.data.addresses.map(toHexAddr).join(" ")
                  : "none"}
              </Text>
            </Box>
          )}
        </Box>

        <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
          <Text color="gray">Live motion data (accel / gyro / mag / quaternion)</Text>
          <Text color="yellow">
            ⏳ Deferred — needs the BNO085 SHTP read helper (planned next phase).
          </Text>
        </Box>
      </Box>
      <KeyHints
        hints={[
          { keys: "r", label: "rescan" },
          { keys: "q", label: "back" },
        ]}
      />
    </Box>
  );
}
