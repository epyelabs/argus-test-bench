import { Box, Text } from "ink";
import { BOARD_NAME } from "../config/hardware.js";
import { hostLabel, isMock } from "../lib/platform.js";
import { formatBytes } from "../lib/format.js";
import { useSystemMetrics } from "../lib/useSystemMetrics.js";
import type { UsageInfo } from "../hardware/system.js";

/** Persistent title bar shown at the top of every screen. */
export function Header({ title }: { title: string }) {
  const m = useSystemMetrics();

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      marginBottom={1}
    >
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          ARGUS Test Bench
        </Text>
        <Text color={isMock() ? "yellow" : "green"}>{hostLabel()}</Text>
      </Box>
      <Box justifyContent="space-between">
        <Text color="gray">{BOARD_NAME}</Text>
        <Text color="white">{title}</Text>
      </Box>

      {/* CPU per-core (left) and temperature (right). Falls back to an
          aggregate on many-core hosts so the row never overflows the box. */}
      <Box justifyContent="space-between">
        <Box>
          <Text color="gray">CPU </Text>
          {!m.cpu ? (
            <Text color="gray">…</Text>
          ) : m.cpu.perCore.length <= 8 ? (
            m.cpu.perCore.map((p, i) => (
              <Text key={i} color={pctColor(p)}>
                {`c${i} ${Math.round(p)}% `}
              </Text>
            ))
          ) : (
            <Text color={pctColor(m.cpu.overall)}>
              {`${Math.round(m.cpu.overall)}% (${m.cpu.perCore.length}c)`}
            </Text>
          )}
        </Box>
        {m.tempC !== null ? (
          <Text color={tempColor(m.tempC)}>{`${m.tempC.toFixed(1)}°C`}</Text>
        ) : (
          <Text color="gray">—°C</Text>
        )}
      </Box>

      {/* Load average, RAM, and disk usage */}
      <Box justifyContent="space-between">
        <Text color="gray">
          {`load ${m.load.map((x) => x.toFixed(2)).join(" ")}`}
        </Text>
        <Text color={pctColor(m.mem.usedPct)}>{`RAM ${usageLabel(m.mem)}`}</Text>
        {m.disk ? (
          <Text color={pctColor(m.disk.usedPct)}>{`Disk ${usageLabel(m.disk)}`}</Text>
        ) : (
          <Text color="gray">Disk —</Text>
        )}
      </Box>

      {/* OS + architecture */}
      <Box>
        <Text color="gray">{`${m.os.pretty} ${m.os.arch}`}</Text>
      </Box>
    </Box>
  );
}

/** "1.2 GB/4.0 GB 31%" for a usage reading. */
function usageLabel(u: UsageInfo): string {
  return `${formatBytes(u.usedBytes)}/${formatBytes(u.totalBytes)} ${Math.round(u.usedPct)}%`;
}

/** Green under 70%, yellow to 90%, red beyond — matches the status palette. */
function pctColor(pct: number): string {
  if (pct < 70) return "green";
  if (pct < 90) return "yellow";
  return "red";
}

/** Pi throttles around 80–85°C, so warn well before that. */
function tempColor(c: number): string {
  if (c < 60) return "green";
  if (c < 75) return "yellow";
  return "red";
}
