/**
 * Captured sample outputs from the real tools, used both by ARGUS_MOCK mode
 * (so the UI is fully navigable on macOS) and by the parser unit tests.
 *
 * These mirror real RPi OS Bookworm output formats so the parsers are
 * exercised against realistic text, not idealized strings.
 */

/** `rpicam-hello --list-cameras` with two CSI cameras attached. */
export const RPICAM_LIST = `Available cameras
-----------------
0 : imx708 [4608x2592 10-bit RGGB] (/base/axi/pcie@120000/rp1/i2c@88000/imx708@1a)
    Modes: 'SRGGB10_CSI2P' : 1536x864 [120.13 fps - (768, 432)/3072x1728 crop]
                             2304x1296 [56.03 fps - (0, 0)/4608x2592 crop]
                             4608x2592 [14.35 fps - (0, 0)/4608x2592 crop]

1 : ov5647 [2592x1944 10-bit GBRG] (/base/axi/pcie@120000/rp1/i2c@80000/ov5647@36)
    Modes: 'SGBRG10_CSI2P' : 640x480 [58.92 fps - (16, 0)/2560x1920 crop]
                             1296x972 [43.25 fps - (0, 0)/2592x1944 crop]
                             2592x1944 [15.63 fps - (0, 0)/2592x1944 crop]
`;

/** `rpicam-hello --list-cameras` when no cameras are detected. */
export const RPICAM_LIST_EMPTY = `No cameras available!
`;

/** `lsusb` line for the SIM7600 modem (plus noise). */
export const LSUSB = `Bus 003 Device 002: ID 1e0e:9011 Qualcomm / Option SimTech, Incorporated
Bus 001 Device 003: ID 046d:0825 Logitech, Inc. Webcam C270
Bus 001 Device 001: ID 1d6b:0002 Linux Foundation 2.0 root hub
`;

export const LSUSB_NO_MODEM = `Bus 001 Device 001: ID 1d6b:0002 Linux Foundation 2.0 root hub
`;

/** Daemon telemetry JSON (connected). */
export const TELEMETRY_JSON = JSON.stringify(
  {
    timestamp: "2026-06-13T08:21:45Z",
    csq: 18,
    rssi_dbm: -77,
    csq_interval: 30,
    status: "connected",
    iface: "usb0",
    ip: "10.164.20.3",
  },
  null,
  2,
);

/** `i2cdetect -y 1` grid with BNO085 (0x4a) and BMS (0x6b) present. */
export const I2CDETECT = `     0  1  2  3  4  5  6  7  8  9  a  b  c  d  e  f
00:                         -- -- -- -- -- -- -- --
10: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
20: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
30: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
40: -- -- -- -- -- -- -- -- -- -- 4a -- -- -- -- --
50: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
60: -- -- -- -- -- -- -- -- -- -- -- 6b -- -- -- --
70: -- -- -- -- -- -- -- --
`;

/** `arecord -l` listing an I2S MEMS mic card. */
export const ARECORD_L = `**** List of CAPTURE Hardware Devices ****
card 0: vc4hdmi [vc4-hdmi], device 0: MAI PCM i2s-hifi-0 [MAI PCM i2s-hifi-0]
  Subdevices: 1/1
  Subdevice #0: subdevice #0
card 2: sph0645 [snd_rpi_simple_card], device 0: simple-card_codec_link snd-soc-dummy-dai-0 [simple-card_codec_link snd-soc-dummy-dai-0]
  Subdevices: 1/1
  Subdevice #0: subdevice #0
`;

export const ARECORD_L_NONE = `**** List of CAPTURE Hardware Devices ****
`;

/** Sample NMEA burst with a valid fix. */
export const NMEA_LINES = [
  "$GPGGA,083745.000,1430.1234,N,12101.5678,E,1,08,0.9,545.4,M,46.9,M,,*56",
  "$GPRMC,083745.000,A,1430.1234,N,12101.5678,E,0.06,31.66,130626,,,A*5A",
  "$GPGSV,3,1,11,03,03,111,00,04,15,270,00*7F",
];

/** `pinctrl get <n>` sample lines (level after the `=` style varies by version). */
export const PINCTRL_GET_HIGH = "12: op dh pn | hi // GPIO12 = output";
export const PINCTRL_GET_LOW = "16: op dl pd | lo // GPIO16 = output";
