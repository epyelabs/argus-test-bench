/**
 * Hardware map for the Argus CM5 Edge Video Node (v1.0 board).
 *
 * Single source of truth, taken from
 * `Argus-Board_PCBA-v1.0-User-Guide-Rev-B.pdf` (I/O and Interface Table).
 * The CLI is the test bench for this exact board, so every pin / address /
 * device path lives here rather than being scattered through the modules.
 */

/** RGB LED — active HIGH (1 = ON), oriented parallel to the user. */
export const RGB_LED = {
  red: { gpio: 12 },
  green: { gpio: 21 },
  blue: { gpio: 16 },
} as const;

export type LedColor = keyof typeof RGB_LED;

/** Camera GPIOs (shared CAM_GPIO0/1 control both ports by default). */
export const CAMERA = {
  /** CAM0 power enable, CAM_GPIO0. 1 = ON. */
  powerEnableGpio: 34,
  /** CAM0 LED enable, CAM_GPIO1. 1 = ON (if module has an onboard LED). */
  ledEnableGpio: 35,
  /** Max simultaneous sources: 2 CSI/MIPI + 1 UVC USB. */
  maxSources: 3,
} as const;

/** LTE / GNSS modem — SIM7600X-H-M2 over the M.2 B-key slot. */
export const LTE = {
  /** SimCom USB vendor:product as seen by `lsusb` (also matches "SimTech"). */
  usbVendorId: "1e0e",
  usbProductIds: ["9011", "9001"],
  /** AT command port — OWNED by sim7600-lte.service. Do not open it here. */
  atPort: "/dev/ttyUSB2",
  /** Dedicated NMEA GPS port, read-only, independent of the AT daemon. */
  nmeaPort: "/dev/ttyUSB1",
  /** Atomic telemetry JSON published by the connection-manager daemon. */
  telemetryFile: "/run/sim7600-lte/telemetry.json",
  /**
   * M.2 WWAN control/status straps (v1.0 board User Guide, I/O & Interface
   * Table). `dir: "out"` pins are togglable from the bench; `dir: "in"` is a
   * read-only status line. `def` is the hardware-default level and `levels`
   * maps a raw GPIO level to its documented meaning. NGFF_RESET# is a reset
   * line: driving it 1 holds the modem in reset, so it must be toggled back
   * to 0 (Normal) to clear.
   */
  controlPins: [
    { key: "power", signal: "FULL_CARD_POWER_OFF#", gpio: 5,  dir: "out", def: 1, levels: { 0: "WWAN OFF",      1: "WWAN ON" } },
    { key: "gnss",  signal: "GNSS_DISABLE",         gpio: 10, dir: "out", def: 1, levels: { 0: "GNSS inactive", 1: "GNSS active" } },
    { key: "wwan",  signal: "WWAN_DISABLE",         gpio: 11, dir: "out", def: 1, levels: { 0: "WWAN inactive", 1: "WWAN active" } },
    { key: "reset", signal: "NGFF_RESET#",          gpio: 27, dir: "out", def: 0, levels: { 0: "Normal",        1: "Reset (toggle back to clear)" } },
    { key: "wake",  signal: "WAKE_ON_WAN#",         gpio: 9,  dir: "in",  def: 1, levels: { 0: "Wake event",    1: "Idle" } },
  ],
} as const;

/** IMU — BNO085 on I2C1, sharing the bus with the BMS/charger. */
export const IMU = {
  i2cBus: 1,
  /**
   * BNO085 7-bit address is strap-selectable via the ADR/SA0 pin:
   * 0x4A (default) or 0x4B. Detection accepts either.
   */
  addresses: [0x4a, 0x4b],
  /** Battery charger / BMS (MP2696) on the same bus — reported, not used. */
  bmsAddress: 0x6b,
  resetGpio: 4,
} as const;

/** MEMS microphone — SPH0645LM4H-B, I2S0. Appears as an ALSA capture card. */
export const MIC = {
  i2s: { wsGpio: 19, sclkGpio: 18, sdGpio: 20 },
  /**
   * Substrings used to flag the I2S mic among `arecord -l` cards.
   * Deliberately NOT bare "i2s" — that false-matches HDMI's "i2s-hifi".
   */
  cardHints: ["sph0645", "ics-43434", "googlevoicehat", "simple-card", "mems"],
  /** SPH0645 delivers 24-bit samples inside 32-bit frames. */
  recordFormat: "S32_LE",
  recordRate: 48000,
  recordChannels: 2,
  /**
   * Digital gain applied to capture. I2S MEMS mics like the SPH0645 have no
   * hardware gain and are quiet, so we amplify in software. Override with
   * ARGUS_MIC_GAIN. ~10–30 is typical; lower it if the meter pegs/clips.
   */
  defaultGain: 16,
} as const;

/** Board ID strap GPIOs (read-only). 000 = Argus CM5 Edge Video Node v1.0. */
export const BOARD_ID = {
  gpios: [26, 13, 6] as const,
  known: {
    "000": "ARGUS:A:A:00 — Edge Video Node v1.0",
  } as Record<string, string>,
};

export const BOARD_NAME = "Argus CM5 Edge Video Node v1.0";
