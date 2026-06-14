import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { StatusBadge } from "../components/StatusBadge.js";
import { BOARD_ID } from "../config/hardware.js";
import { readBoardId, type BoardIdInfo } from "../hardware/boardId.js";
import { noop, type ModuleViewProps } from "../dashboard/moduleView.js";

const HINTS = [{ keys: "q/Esc", label: "back" }];

/**
 * Read-only Board ID module. Reads the three version straps once on mount and
 * shows the decoded code + part number. No controls beyond the back key — while
 * a module operates, the dashboard's own input is disabled, so each view must
 * own its exit key (see DashboardScreen).
 */
export function BoardIdScreen({
  visible = true,
  active = true,
  onStatus = noop,
  onHints = noop,
  onExit,
  onBack,
}: ModuleViewProps) {
  const exit = onExit ?? onBack ?? noop;
  const [info, setInfo] = useState<BoardIdInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await readBoardId();
      if (!alive) return;
      if (r.available) setInfo(r.data);
      else setError(r.reason);
      setBusy(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const statusLabel = busy ? "reading" : error ? "error" : (info?.code ?? "—");
  const statusKind = busy ? "busy" : error ? "error" : info?.partNumber ? "ok" : "warn";

  useEffect(() => {
    onStatus({ label: statusLabel, status: statusKind });
  }, [statusLabel, statusKind, onStatus]);

  useEffect(() => {
    if (active) onHints(HINTS);
  }, [active, onHints]);

  useInput(
    (input, key) => {
      if (key.escape || input === "q") exit();
    },
    { isActive: active },
  );

  if (!visible) return null;

  return (
    <Box flexDirection="column">
      {busy ? (
        <Text color="gray">Reading board ID…</Text>
      ) : info ? (
        <>
          {BOARD_ID.gpios.map((gpio, i) => (
            <StatusBadge key={gpio} status={info.bits[i] ? "ok" : "unknown"}>
              <Text bold>{`ID${i}`.padEnd(5)}</Text>
              <Text color="gray">{`GPIO${gpio}`.padEnd(8)}</Text>
              <Text>{info.bits[i] ? "1" : "0"}</Text>
            </StatusBadge>
          ))}
          <Box marginTop={1}>
            <Text>
              Board ID <Text bold>{info.code}</Text>
            </Text>
          </Box>
          {info.partNumber ? (
            <Text color="green">{info.partNumber}</Text>
          ) : (
            <Text color="yellow">unknown board (code {info.code} not in table)</Text>
          )}
        </>
      ) : null}
      {error ? (
        <Box marginTop={1}>
          <Text color="red">⚠ {error}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
