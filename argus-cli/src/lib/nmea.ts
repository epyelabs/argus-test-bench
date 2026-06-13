/**
 * Minimal NMEA 0183 parser — just enough for the LTE/GNSS screen.
 *
 * The SIM7600 emits standard sentences on its NMEA port. We only need a
 * position fix, so we parse GGA (fix + altitude + satellites) and RMC
 * (lat/lon + speed + date/time). No native serialport dependency: the LTE
 * module reads raw lines off the tty and feeds them here.
 */

export interface GpsFix {
  /** Decimal degrees, north positive. */
  latitude?: number;
  /** Decimal degrees, east positive. */
  longitude?: number;
  /** Metres above mean sea level (GGA). */
  altitude?: number;
  /** GGA fix quality: 0 = none, 1 = GPS, 2 = DGPS. */
  fixQuality?: number;
  satellites?: number;
  /** Speed over ground in km/h (from RMC knots). */
  speedKmh?: number;
  /** RMC status: true = "A" (valid), false = "V" (void). */
  valid?: boolean;
  /** UTC time HH:MM:SS as reported. */
  utcTime?: string;
}

/** Convert NMEA ddmm.mmmm + hemisphere to signed decimal degrees. */
function nmeaCoordToDecimal(value: string, hemisphere: string): number | undefined {
  if (!value) return undefined;
  const dot = value.indexOf(".");
  if (dot < 3) return undefined;
  const degLen = dot - 2; // minutes are always 2 integer digits
  const degrees = parseInt(value.slice(0, degLen), 10);
  const minutes = parseFloat(value.slice(degLen));
  if (Number.isNaN(degrees) || Number.isNaN(minutes)) return undefined;
  let dec = degrees + minutes / 60;
  if (hemisphere === "S" || hemisphere === "W") dec = -dec;
  return dec;
}

function formatUtc(raw: string): string | undefined {
  if (!raw || raw.length < 6) return undefined;
  return `${raw.slice(0, 2)}:${raw.slice(2, 4)}:${raw.slice(4, 6)}`;
}

/** Verify the `*HH` checksum when present; tolerate sentences without one. */
export function checksumValid(sentence: string): boolean {
  const star = sentence.indexOf("*");
  if (star === -1) return true; // no checksum provided
  const body = sentence.slice(sentence.startsWith("$") ? 1 : 0, star);
  const expected = parseInt(sentence.slice(star + 1, star + 3), 16);
  if (Number.isNaN(expected)) return false;
  let cs = 0;
  for (let i = 0; i < body.length; i++) cs ^= body.charCodeAt(i);
  return cs === expected;
}

/** Parse a single sentence into a partial fix, or null if unsupported/invalid. */
export function parseSentence(line: string): Partial<GpsFix> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("$")) return null;
  if (!checksumValid(trimmed)) return null;

  const star = trimmed.indexOf("*");
  const body = star === -1 ? trimmed : trimmed.slice(0, star);
  const fields = body.split(",");
  const type = fields[0].slice(3); // drop the $GP / $GN / $GL talker id

  if (type === "GGA") {
    return {
      utcTime: formatUtc(fields[1]),
      latitude: nmeaCoordToDecimal(fields[2], fields[3]),
      longitude: nmeaCoordToDecimal(fields[4], fields[5]),
      fixQuality: fields[6] ? parseInt(fields[6], 10) : undefined,
      satellites: fields[7] ? parseInt(fields[7], 10) : undefined,
      altitude: fields[9] ? parseFloat(fields[9]) : undefined,
    };
  }

  if (type === "RMC") {
    const knots = fields[7] ? parseFloat(fields[7]) : NaN;
    return {
      utcTime: formatUtc(fields[1]),
      valid: fields[2] === "A",
      latitude: nmeaCoordToDecimal(fields[3], fields[4]),
      longitude: nmeaCoordToDecimal(fields[5], fields[6]),
      speedKmh: Number.isNaN(knots) ? undefined : knots * 1.852,
    };
  }

  return null;
}

/** Merge a stream of sentences into a single best-effort fix. */
export function aggregateFix(lines: string[]): GpsFix {
  const fix: GpsFix = {};
  for (const line of lines) {
    const partial = parseSentence(line);
    if (!partial) continue;
    for (const [k, v] of Object.entries(partial)) {
      if (v !== undefined && !Number.isNaN(v as number)) {
        (fix as Record<string, unknown>)[k] = v;
      }
    }
  }
  return fix;
}

export function hasPosition(fix: GpsFix): boolean {
  return typeof fix.latitude === "number" && typeof fix.longitude === "number";
}
