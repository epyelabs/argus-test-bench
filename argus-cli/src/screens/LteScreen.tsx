import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { Header } from "../components/Header.js";
import { KeyHints } from "../components/KeyHints.js";
import { StatusBadge, type Status } from "../components/StatusBadge.js";
import { csqQuality } from "../lib/format.js";
import { hasPosition } from "../lib/nmea.js";
import {
  detectModem,
  readGps,
  readTelemetry,
  type GpsResult,
  type ModemInfo,
  type Telemetry,
} from "../hardware/lte.js";
import type { HalResult } from "../hardware/types.js";

const STATUS_MAP: Record<string, Status> = {
  connected: "ok",
  connecting: "busy",
  disconnected: "warn",
  dead_zone: "error",
};

export function LteScreen({ onBack }: { onBack: () => void }) {
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

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      onBack();
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
  });

  return (
    <Box flexDirection="column">
      <Header title="LTE / GNSS — SIM7600" />
      <Box flexDirection="column" paddingX={1} gap={1}>
        {/* Detection */}
        <Box flexDirection="column">
          <Text bold color="cyan">
            Modem
          </Text>
          {!modem ? (
            <Text>
              <Spinner type="dots" /> Detecting (lsusb)…
            </Text>
          ) : !modem.available ? (
            <Text color="red">⚠ {modem.reason}</Text>
          ) : modem.data.present ? (
            <Box flexDirection="column">
              <StatusBadge status="ok">
                Present — {modem.data.usbId} {modem.data.description}
              </StatusBadge>
              <Text color="gray">
                ports: {modem.data.ttyPorts.length ? modem.data.ttyPorts.join(" ") : "none"}
              </Text>
            </Box>
          ) : (
            <StatusBadge status="error">Not detected on USB</StatusBadge>
          )}
        </Box>

        {/* Live telemetry from the daemon */}
        <Box flexDirection="column">
          <Text bold color="cyan">
            Signal &amp; link <Text color="gray">(live from daemon telemetry)</Text>
          </Text>
          {!telem ? (
            <Text>
              <Spinner type="dots" /> Reading telemetry…
            </Text>
          ) : !telem.available ? (
            <Text color="yellow">○ {telem.reason}</Text>
          ) : (
            <Box flexDirection="column">
              <StatusBadge status={STATUS_MAP[telem.data.status] ?? "unknown"}>
                {telem.data.status}
              </StatusBadge>
              <Text>
                CSQ {telem.data.csq} ({telem.data.rssi_dbm ?? "—"} dBm,{" "}
                {csqQuality(telem.data.csq)})
              </Text>
              <Text color="gray">
                {telem.data.iface} · ip {telem.data.ip ?? "—"} · {telem.data.timestamp}
              </Text>
            </Box>
          )}
        </Box>

        {/* GPS / GNSS */}
        <Box flexDirection="column">
          <Text bold color="cyan">
            GPS <Text color="gray">(NMEA on /dev/ttyUSB1)</Text>
          </Text>
          {gpsBusy ? (
            <Text>
              <Spinner type="dots" /> Reading NMEA for a few seconds…
            </Text>
          ) : !gps ? (
            <Text color="gray">Press g to read a position fix.</Text>
          ) : !gps.available ? (
            <Text color="yellow">○ {gps.reason}</Text>
          ) : gps.data.sentenceCount === 0 ? (
            <Box flexDirection="column">
              <Text color="yellow">○ No NMEA sentences received.</Text>
              <Text color="gray">GPS may need enabling (AT+CGPS=1 via the AT port/daemon).</Text>
            </Box>
          ) : hasPosition(gps.data.fix) ? (
            <Box flexDirection="column">
              <StatusBadge status="ok">
                {gps.data.fix.latitude!.toFixed(6)}, {gps.data.fix.longitude!.toFixed(6)}
              </StatusBadge>
              <Text color="gray">
                alt {fmt(gps.data.fix.altitude, "m")} · sats {gps.data.fix.satellites ?? "—"} ·
                speed {fmt(gps.data.fix.speedKmh, "km/h")} · {gps.data.fix.utcTime ?? ""} UTC
              </Text>
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text color="yellow">○ Receiving NMEA but no position fix yet.</Text>
              <Text color="gray">
                {gps.data.sentenceCount} sentences · waiting for satellite lock.
              </Text>
            </Box>
          )}
        </Box>
      </Box>
      <KeyHints
        hints={[
          { keys: "g", label: "read GPS" },
          { keys: "q", label: "back" },
        ]}
      />
    </Box>
  );
}

function fmt(n: number | undefined, unit: string): string {
  return n === undefined ? "—" : `${n.toFixed(1)} ${unit}`;
}
