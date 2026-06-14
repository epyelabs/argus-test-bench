import { useState } from "react";
import { Box } from "ink";
import { Header } from "../components/Header.js";
import { KeyHints, type Hint } from "../components/KeyHints.js";
import { useTerminalSize } from "../lib/useTerminalSize.js";
import { LtePanel } from "../dashboard/panels/LtePanel.js";
import { ImuPanel } from "../dashboard/panels/ImuPanel.js";
import { LedPanel } from "../dashboard/panels/LedPanel.js";
import { MicPanel } from "../dashboard/panels/MicPanel.js";
import { CameraPanel } from "../dashboard/panels/CameraPanel.js";
import type { Screen } from "../app.js";

/** Min terminal width (cols) at which we switch from a stack to a 2-column grid. */
const WIDE_THRESHOLD = 100;

/**
 * All-modules dashboard. Every hardware module is a focusable section; Tab moves
 * focus and keys act on the focused section only (Ink's built-in focus system).
 */
export function DashboardScreen({ onOpen }: { onOpen: (s: Screen) => void }) {
  const { columns } = useTerminalSize();
  const [focusedHints, setFocusedHints] = useState<Hint[]>([]);

  const common = { onOpen, onHints: setFocusedHints };
  // Order = Tab order. LTE auto-focuses on landing.
  const panels = [
    <LtePanel key="lte" focusId="lte" autoFocus {...common} />,
    <ImuPanel key="imu" focusId="imu" {...common} />,
    <LedPanel key="led" focusId="led" {...common} />,
    <MicPanel key="mic" focusId="mic" {...common} />,
    <CameraPanel key="camera" focusId="camera" {...common} />,
  ];

  return (
    <Box flexDirection="column">
      <Header title="Dashboard" />
      {columns >= WIDE_THRESHOLD ? (
        <TwoColumnGrid panels={panels} />
      ) : (
        <Box flexDirection="column" gap={1}>
          {panels}
        </Box>
      )}
      <KeyHints
        hints={[
          ...focusedHints,
          { keys: "Tab", label: "switch" },
          { keys: "q", label: "quit" },
        ]}
      />
    </Box>
  );
}

/**
 * Two panels per row, row-major. Keeping it row-major means the Tab focus order
 * (which follows render order) matches the natural left-to-right, top-to-bottom
 * reading order — and stays identical to the single-column stack order.
 */
function TwoColumnGrid({ panels }: { panels: React.ReactNode[] }) {
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < panels.length; i += 2) rows.push(panels.slice(i, i + 2));
  return (
    <Box flexDirection="column" gap={1}>
      {rows.map((row, i) => (
        <Box key={i} flexDirection="row" gap={2}>
          <Box flexDirection="column" width="50%">
            {row[0]}
          </Box>
          <Box flexDirection="column" width="50%">
            {row[1] ?? null}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
