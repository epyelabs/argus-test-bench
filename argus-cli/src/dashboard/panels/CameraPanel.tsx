import { useEffect, useState } from "react";
import { Text, useFocus, useInput } from "ink";
import Spinner from "ink-spinner";
import { StatusBadge } from "../../components/StatusBadge.js";
import { listAllCameras, maxFps, type Camera } from "../../hardware/camera.js";
import { PanelFrame } from "../PanelFrame.js";
import type { PanelProps } from "./types.js";

const HINTS = [{ keys: "↵", label: "open (snapshot / record)" }];

/** Cameras — detection summary; Enter drills into the full snapshot/record flow. */
export function CameraPanel({ focusId, autoFocus, onOpen, onHints }: PanelProps) {
  const { isFocused } = useFocus({ id: focusId, autoFocus });
  const [cameras, setCameras] = useState<Camera[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listAllCameras().then((r) => {
      if (!active) return;
      if (r.available) setCameras(r.data);
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
      if (key.return) onOpen("camera");
    },
    { isActive: isFocused },
  );

  return (
    <PanelFrame title="Cameras (CSI + USB)" isFocused={isFocused}>
      {error ? (
        <Text color="red">⚠ {error}</Text>
      ) : !cameras ? (
        <Text>
          <Spinner type="dots" /> Listing cameras…
        </Text>
      ) : cameras.length === 0 ? (
        <Text color="yellow">○ No cameras detected.</Text>
      ) : (
        <>
          <StatusBadge status="ok">
            {cameras.length} source{cameras.length === 1 ? "" : "s"}
          </StatusBadge>
          {cameras.map((c) => (
            <Text key={`${c.kind}-${c.index}-${c.device ?? c.bus ?? ""}`}>
              <Text color="cyan">{c.kind.toUpperCase()}</Text> {c.name}{" "}
              <Text color="gray">
                {c.maxResolution ?? "—"}
                {c.modes.length ? ` @ ${maxFps(c)}fps` : ""}
              </Text>
            </Text>
          ))}
        </>
      )}
    </PanelFrame>
  );
}
