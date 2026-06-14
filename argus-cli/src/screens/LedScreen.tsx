import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { StatusBadge } from "../components/StatusBadge.js";
import { RGB_LED, type LedColor } from "../config/hardware.js";
import { getAllLeds, LED_COLORS, setAllLeds, setLed } from "../hardware/led.js";
import { noop, type ModuleViewProps } from "../dashboard/moduleView.js";

const COLOR_TEXT: Record<LedColor, string> = { red: "red", green: "green", blue: "blue" };

const HINTS = [
  { keys: "r/g/b", label: "toggle" },
  { keys: "a", label: "all on" },
  { keys: "x", label: "all off" },
  { keys: "q/Esc", label: "back" },
];

export function LedScreen({
  visible = true,
  active = true,
  onStatus = noop,
  onHints = noop,
  onExit,
  onBack,
}: ModuleViewProps) {
  const exit = onExit ?? onBack ?? noop;
  const [state, setState] = useState<Record<LedColor, boolean>>({
    red: false,
    green: false,
    blue: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await getAllLeds();
      if (!alive) return;
      if (r.available) setState(r.data);
      else setError(r.reason);
      setBusy(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const lit = LED_COLORS.filter((c) => state[c]);
  const statusLabel = busy
    ? "reading"
    : error
      ? "error"
      : lit.length
        ? lit.map((c) => c[0].toUpperCase()).join(" ")
        : "off";
  const statusKind = busy ? "busy" : error ? "error" : lit.length ? "ok" : "unknown";

  useEffect(() => {
    onStatus({ label: statusLabel, status: statusKind });
  }, [statusLabel, statusKind, onStatus]);

  useEffect(() => {
    if (active) onHints(HINTS);
  }, [active, onHints]);

  async function toggle(color: LedColor) {
    const next = !state[color];
    const r = await setLed(color, next);
    if (r.available) {
      setState((s) => ({ ...s, [color]: next }));
      setError(null);
    } else {
      setError(r.reason);
    }
  }

  async function all(on: boolean) {
    const r = await setAllLeds(on);
    if (r.available) {
      setState({ red: on, green: on, blue: on });
      setError(null);
    } else {
      setError(r.reason);
    }
  }

  useInput(
    (input, key) => {
      if (key.escape || input === "q") {
        exit();
        return;
      }
      if (input === "r") void toggle("red");
      else if (input === "g") void toggle("green");
      else if (input === "b") void toggle("blue");
      else if (input === "a") void all(true);
      else if (input === "x") void all(false);
    },
    { isActive: active },
  );

  if (!visible) return null;

  return (
    <Box flexDirection="column">
      {busy ? (
        <Text color="gray">Reading LED state…</Text>
      ) : (
        LED_COLORS.map((color) => (
          <StatusBadge key={color} status={state[color] ? "ok" : "unknown"}>
            <Text color={COLOR_TEXT[color]} bold>
              {color.toUpperCase().padEnd(6)}
            </Text>
            <Text color="gray"> GPIO{String(RGB_LED[color].gpio).padEnd(3)} </Text>
            <Text>{state[color] ? "ON " : "OFF"}</Text>
          </StatusBadge>
        ))
      )}
      {error ? (
        <Box marginTop={1}>
          <Text color="red">⚠ {error}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
