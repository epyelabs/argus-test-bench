import { useEffect, useState } from "react";
import { Text, useFocus, useInput } from "ink";
import { StatusBadge } from "../../components/StatusBadge.js";
import { RGB_LED, type LedColor } from "../../config/hardware.js";
import { getAllLeds, LED_COLORS, setAllLeds, setLed } from "../../hardware/led.js";
import { PanelFrame } from "../PanelFrame.js";
import type { PanelProps } from "./types.js";

const COLOR_TEXT: Record<LedColor, string> = { red: "red", green: "green", blue: "blue" };

const HINTS = [
  { keys: "r/g/b", label: "toggle" },
  { keys: "a", label: "all on" },
  { keys: "x", label: "all off" },
];

/** RGB LED — fully inline (cheap set-and-forget GPIO toggles). */
export function LedPanel({ focusId, autoFocus, onHints }: PanelProps) {
  const { isFocused } = useFocus({ id: focusId, autoFocus });
  const [state, setState] = useState<Record<LedColor, boolean>>({
    red: false,
    green: false,
    blue: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const r = await getAllLeds();
      if (!active) return;
      if (r.available) setState(r.data);
      else setError(r.reason);
      setBusy(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isFocused) onHints(HINTS);
  }, [isFocused, onHints]);

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
    (input) => {
      if (input === "r") void toggle("red");
      else if (input === "g") void toggle("green");
      else if (input === "b") void toggle("blue");
      else if (input === "a") void all(true);
      else if (input === "x") void all(false);
    },
    { isActive: isFocused },
  );

  return (
    <PanelFrame title="RGB LED" isFocused={isFocused}>
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
      {error ? <Text color="red">⚠ {error}</Text> : null}
    </PanelFrame>
  );
}
