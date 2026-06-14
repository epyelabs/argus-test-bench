/**
 * Polls host system metrics on an interval for the header.
 *
 * CPU busy% is a rate, so it needs two tick snapshots: we keep the previous
 * sample in a ref and diff it each tick (see hardware/system.computeCpuLoad).
 * Everything else is read fresh each tick. The poll cadence and cleanup mirror
 * the screen polls (e.g. LteScreen): an `alive` flag guards against
 * setState-after-unmount.
 */
import { useEffect, useRef, useState } from "react";
import {
  type CpuLoad,
  type CpuSample,
  type UsageInfo,
  computeCpuLoad,
  loadAverage,
  osInfo,
  readCpuTemp,
  readDisk,
  readMemory,
  sampleCpu,
} from "../hardware/system.js";

export interface SystemMetrics {
  cpu: CpuLoad | null;
  load: [number, number, number];
  tempC: number | null;
  mem: UsageInfo;
  disk: UsageInfo | null;
  os: { pretty: string; arch: string };
}

const POLL_MS = 2000;

export function useSystemMetrics(): SystemMetrics {
  const prevCpu = useRef<CpuSample>(sampleCpu());
  const [metrics, setMetrics] = useState<SystemMetrics>(() => ({
    cpu: null, // first real reading needs a second sample to diff against
    load: loadAverage(),
    tempC: null,
    mem: readMemory(),
    disk: null,
    os: osInfo(),
  }));

  useEffect(() => {
    let alive = true;

    const poll = async () => {
      const curr = sampleCpu();
      const cpu = computeCpuLoad(prevCpu.current, curr);
      prevCpu.current = curr;

      const [tempC, disk] = await Promise.all([readCpuTemp(), readDisk()]);
      if (!alive) return;
      setMetrics((m) => ({
        ...m,
        cpu,
        load: loadAverage(),
        tempC,
        mem: readMemory(),
        disk,
      }));
    };

    void poll(); // populate immediately so the header isn't blank for one tick
    const timer = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return metrics;
}
