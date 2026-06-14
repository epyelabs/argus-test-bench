import { useEffect, useState } from "react";
import { Box, Text, useFocus, useInput } from "ink";
import Spinner from "ink-spinner";
import { StatusBadge, type Status } from "../../components/StatusBadge.js";
import { csqQuality } from "../../lib/format.js";
import { hasPosition } from "../../lib/nmea.js";
import {
  detectModem,
  readGps,
  readTelemetry,
  type GpsResult,
  type ModemInfo,
  type Telemetry,
} from "../../hardware/lte.js";
import type { HalResult } from "../../hardware/types.js";
import { PanelFrame } from "../PanelFrame.js";
import type { PanelProps } from "./types.js";

const STATUS_MAP: Record<string, Status> = {
  connected: "ok",
  connecting: "busy",
  disconnected: "warn",
  dead_zone: "error",
};

const HINTS = [
  { keys: "g", label: "read GPS" },
  { keys: "↵", label: "open" },
];

/** LTE / GNSS — auto-polls telemetry; `g` reads a GPS fix; Enter opens the full screen. */
export function LtePanel({ focusId, autoFocus, onOpen, onHints }: PanelProps) {
  const { isFocused } = useFocus({ id: focusId, autoFocus });
  const [modem, setModem] = useState<HalResult<ModemInfo> | null>(null);
  const [telem, setTelem] = useState<HalResult<Telemetry> | null>(null);
  const [gps, setGps] = useState<HalResult<GpsResult> | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void detectModem().then((r) => active && setModem(r));
    const poll = async () => {
      const r = await readTelemetry();
      if (active) setTelem(r);
    };
    void poll();
    const timer = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (isFocused) onHints(HINTS);
  }, [isFocused, onHints]);

  useInput(
    (input, key) => {
      if (key.return) {
        onOpen("lte");
        return;
      }
      if ((input === "g" || input === "G") && !gpsBusy) {
        setGpsBusy(true);
        setGps(null);
        void readGps().then((r) => {
          setGps(r);
          setGpsBusy(false);
        });
      }
    },
    { isActive: isFocused },
  );

  return (
    <PanelFrame title="LTE / GNSS — SIM7600" isFocused={isFocused}>
      {/* Modem + signal on one compact line each */}
      {!modem ? (
        <Text>
          <Spinner type="dots" /> Detecting modem (lsusb)…
        </Text>
      ) : !modem.available ? (
        <Text color="red">⚠ {modem.reason}</Text>
      ) : modem.data.present ? (
        <StatusBadge status="ok">
          Modem {modem.data.usbId} {modem.data.description}
        </StatusBadge>
      ) : (
        <StatusBadge status="error">Modem not detected on USB</StatusBadge>
      )}

      {!telem ? (
        <Text>
          <Spinner type="dots" /> Reading telemetry…
        </Text>
      ) : !telem.available ? (
        <Text color="yellow">○ {telem.reason}</Text>
      ) : (
        <StatusBadge status={STATUS_MAP[telem.data.status] ?? "unknown"}>
          {telem.data.status} · CSQ {telem.data.csq} ({telem.data.rssi_dbm ?? "—"} dBm,{" "}
          {csqQuality(telem.data.csq)})
        </StatusBadge>
      )}

      {/* GPS — single summary line */}
      {gpsBusy ? (
        <Text>
          <Spinner type="dots" /> Reading NMEA…
        </Text>
      ) : !gps ? (
        <Text color="gray">GPS: press g for a fix.</Text>
      ) : !gps.available ? (
        <Text color="yellow">○ {gps.reason}</Text>
      ) : gps.data.sentenceCount === 0 ? (
        <Text color="yellow">○ GPS: no NMEA (enable AT+CGPS=1).</Text>
      ) : hasPosition(gps.data.fix) ? (
        <StatusBadge status="ok">
          GPS {gps.data.fix.latitude!.toFixed(6)}, {gps.data.fix.longitude!.toFixed(6)} · sats{" "}
          {gps.data.fix.satellites ?? "—"}
        </StatusBadge>
      ) : (
        <Box>
          <Text color="yellow">
            ○ GPS: {gps.data.sentenceCount} sentences, no fix yet.
          </Text>
        </Box>
      )}
    </PanelFrame>
  );
}
