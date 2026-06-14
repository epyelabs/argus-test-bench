import { Box, Text } from "ink";
import { hostLabel, isMock } from "../lib/platform.js";
import { formatBytes } from "../lib/format.js";
import { useSystemMetrics } from "../lib/useSystemMetrics.js";
import type { UsageInfo } from "../hardware/system.js";

/** Persistent title bar: host identity on top, live system metrics below. */
export function Header() {
  const m = useSystemMetrics();

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      marginBottom={1}
    >
      {/* Identity (left); host model + OS/arch (right) */}
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          ARGUS Test Bench
        </Text>
        <Box>
          <Text color={isMock() ? "yellow" : "green"}>{hostLabel()}</Text>
          <Text color="gray">{`  ${m.os.pretty} ${m.os.arch}`}</Text>
        </Box>
      </Box>

      {/* CPU: overall + per-core (left), temperature (right). Falls back to an
          aggregate on many-core hosts so the row never overflows the box. */}
      <Box justifyContent="space-between">
        <Box>
          <Text color="gray">CPU </Text>
          {!m.cpu ? (
            <Text color="gray">…</Text>
          ) : (
            <>
              <Text color={pctColor(m.cpu.overall)}>{`${Math.round(m.cpu.overall)}%`}</Text>
              {m.cpu.perCore.length <= 8 ? (
                <>
                  <Text color="gray">{"  │  "}</Text>
                  {m.cpu.perCore.flatMap((p, i) => {
                    const seg = (
                      <Text key={`c${i}`} color={pctColor(p)}>
                        {`c${i} ${Math.round(p)}%`}
                      </Text>
                    );
                    return i === 0
                      ? [seg]
                      : [
                          <Text key={`sep${i}`} color="gray">
                            {" · "}
                          </Text>,
                          seg,
                        ];
                  })}
                </>
              ) : (
                <Text color="gray">{` (${m.cpu.perCore.length}c)`}</Text>
              )}
            </>
          )}
        </Box>
        <Box>
          <Text color="gray">CPU Temp </Text>
          {m.tempC !== null ? (
            <Text color={tempColor(m.tempC)}>{`${m.tempC.toFixed(1)}°C`}</Text>
          ) : (
            <Text color="gray">—</Text>
          )}
        </Box>
      </Box>

      {/* RAM (left) and disk (right) */}
      <Box justifyContent="space-between">
        <Text color={pctColor(m.mem.usedPct)}>{`RAM ${usageLabel(m.mem)}`}</Text>
        {m.disk ? (
          <Text color={pctColor(m.disk.usedPct)}>{`Disk ${usageLabel(m.disk)}`}</Text>
        ) : (
          <Text color="gray">Disk —</Text>
        )}
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
