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
  /** GNSS_DISABLE pin: pull-up default = 1 = GNSS active. */
  gnssDisableGpio: 10,
  /** FULL_CARD_POWER_OFF#: pull-up default = 1 = WWAN powered ON. */
  fullCardPowerOffGpio: 5,
  /** WWAN_DISABLE: pull-up default = 1 = WWAN active. */
  wwanDisableGpio: 11,
  /** NGFF_RESET#: 1 = reset impulse. */
  ngffResetGpio: 27,
} as const;

/** IMU — BNO085 on I2C1, sharing the bus with the BMS/charger. */
export const IMU = {
  i2cBus: 1,
  /** BNO085 default 7-bit address. */
  address: 0x4a,
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
} as const;

/** Board ID strap GPIOs (read-only). 000 = Argus CM5 Edge Video Node v1.0. */
export const BOARD_ID = {
  gpios: [26, 13, 6] as const,
  known: {
    "000": "ARGUS:A:A:00 — Edge Video Node v1.0",
  } as Record<string, string>,
};

export const BOARD_NAME = "Argus CM5 Edge Video Node v1.0";
