import { useEffect, useState } from "react";
import { Text, useFocus, useInput } from "ink";
import Spinner from "ink-spinner";
import { StatusBadge } from "../../components/StatusBadge.js";
import { listMics, type MicDevice } from "../../hardware/mic.js";
import { PanelFrame } from "../PanelFrame.js";
import type { PanelProps } from "./types.js";

const HINTS = [{ keys: "↵", label: "open (meter / record)" }];

/** Microphone — detection summary; Enter drills into the full meter/record flow. */
export function MicPanel({ focusId, autoFocus, onOpen, onHints }: PanelProps) {
  const { isFocused } = useFocus({ id: focusId, autoFocus });
  const [mics, setMics] = useState<MicDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listMics().then((r) => {
      if (!active) return;
      if (r.available) setMics(r.data);
      else setError(r.reason);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isFocused) onHints(HINTS);
  }, [isFocused, onHints]);

  useInput(
    (_input, key) => {
      if (key.return) onOpen("mic");
    },
    { isActive: isFocused },
  );

  // Default to the flagged I2S mic, falling back to the first device.
  const selected = mics?.find((d) => d.isMic) ?? mics?.[0] ?? null;

  return (
    <PanelFrame title="Microphone — I2S MEMS" isFocused={isFocused}>
      {error ? (
        <Text color="red">⚠ {error}</Text>
      ) : !mics ? (
        <Text>
          <Spinner type="dots" /> Listing capture devices…
        </Text>
      ) : mics.length === 0 ? (
        <Text color="yellow">○ No ALSA capture devices found.</Text>
      ) : (
        <>
          <StatusBadge status={selected?.isMic ? "ok" : "warn"}>
            {mics.length} device{mics.length === 1 ? "" : "s"}
            {selected ? ` · ${selected.cardName}${selected.isMic ? " (I2S mic)" : ""}` : ""}
          </StatusBadge>
          {selected ? (
            <Text color="gray">
              card {selected.card},{selected.device} — {selected.cardId}
            </Text>
          ) : null}
        </>
      )}
    </PanelFrame>
  );
}
