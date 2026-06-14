import { useCallback, useMemo, useState } from "react";
import { Box, useApp, useInput } from "ink";
import { Header } from "../components/Header.js";
import { KeyHints, type Hint } from "../components/KeyHints.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { PanelFrame } from "../dashboard/PanelFrame.js";
import { useTerminalSize } from "../lib/useTerminalSize.js";
import type { ModuleStatus } from "../dashboard/moduleView.js";
import { LteScreen } from "./LteScreen.js";
import { ImuScreen } from "./ImuScreen.js";
import { LedScreen } from "./LedScreen.js";
import { MicScreen } from "./MicScreen.js";
import { CameraScreen } from "./CameraScreen.js";

/** Module list — order = list order = the index the dashboard navigates. */
const MODULES = [
  { id: "lte", title: "LTE / GNSS", View: LteScreen },
  { id: "camera", title: "Cameras", View: CameraScreen },
  { id: "mic", title: "Microphone", View: MicScreen },
  { id: "imu", title: "IMU", View: ImuScreen },
  { id: "led", title: "RGB LED", View: LedScreen },
] as const;

/** Fixed left-list width; below this terminal width we stack list over detail. */
const LIST_WIDTH = 26;
const NARROW_THRESHOLD = 80;

const LIST_HINTS: Hint[] = [
  { keys: "↑↓", label: "select" },
  { keys: "↵/→", label: "open" },
  { keys: "q", label: "quit" },
];

/**
 * Master-detail dashboard. The left list pins all modules (with live status);
 * the right pane shows the selected module's full view. All module views stay
 * mounted so their streams/polls keep running while you switch.
 *
 *  - list focus (operating=false): ↑/↓ previews modules, ↵/→ enters the detail.
 *  - detail focus (operating=true): keys act on the module; its back key exits.
 */
export function DashboardScreen() {
  const { exit } = useApp();
  const { columns } = useTerminalSize();
  const twoCol = columns >= NARROW_THRESHOLD;
  // Pin the detail pane's width so long log lines truncate instead of widening
  // the box (which would shove the list around). columns - list - detail margin.
  const detailWidth = twoCol ? columns - LIST_WIDTH - 1 : undefined;

  const [selected, setSelected] = useState(0);
  const [operating, setOperating] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, ModuleStatus>>({});
  const [moduleHints, setModuleHints] = useState<Hint[]>([]);

  const reportStatus = useCallback((id: string, s: ModuleStatus) => {
    setStatuses((prev) =>
      prev[id]?.label === s.label && prev[id]?.status === s.status ? prev : { ...prev, [id]: s },
    );
  }, []);
  // Stable per-module onStatus handlers so child effects don't re-fire each render.
  const statusHandlers = useMemo(
    () =>
      Object.fromEntries(
        MODULES.map((m) => [m.id, (s: ModuleStatus) => reportStatus(m.id, s)]),
      ) as Record<string, (s: ModuleStatus) => void>,
    [reportStatus],
  );
  const stopOperating = useCallback(() => setOperating(false), []);

  useInput(
    (input, key) => {
      if (key.upArrow || input === "k") {
        setSelected((i) => (i - 1 + MODULES.length) % MODULES.length);
      } else if (key.downArrow || input === "j") {
        setSelected((i) => (i + 1) % MODULES.length);
      } else if (key.return || key.rightArrow) {
        setOperating(true);
      } else if (input === "q" || input === "Q") {
        exit();
      }
    },
    { isActive: !operating },
  );

  const list = (
    <Box flexDirection="column" width={twoCol ? LIST_WIDTH : undefined}>
      {MODULES.map((m, i) => {
        const st = statuses[m.id];
        return (
          <PanelFrame key={m.id} title={m.title} isFocused={i === selected}>
            <StatusBadge status={st?.status ?? "unknown"}>{st?.label ?? "…"}</StatusBadge>
          </PanelFrame>
        );
      })}
    </Box>
  );

  const detail = (
    <Box
      flexGrow={twoCol ? 0 : 1}
      width={detailWidth}
      flexDirection="column"
      borderStyle="round"
      borderColor={operating ? "cyan" : "gray"}
      paddingX={1}
      marginLeft={twoCol ? 1 : 0}
      marginTop={twoCol ? 0 : 1}
    >
      {MODULES.map((m, i) => (
        <m.View
          key={m.id}
          visible={i === selected}
          active={i === selected && operating}
          onStatus={statusHandlers[m.id]}
          onHints={setModuleHints}
          onExit={stopOperating}
        />
      ))}
    </Box>
  );

  return (
    <Box flexDirection="column">
      <Header />
      <Box flexDirection={twoCol ? "row" : "column"}>
        {list}
        {detail}
      </Box>
      <KeyHints hints={operating ? moduleHints : LIST_HINTS} />
    </Box>
  );
}
