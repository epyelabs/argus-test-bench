/**
 * Captured sample outputs from the real tools, used both by ARGUS_MOCK mode
 * (so the UI is fully navigable on macOS) and by the parser unit tests.
 *
 * These mirror real RPi OS Bookworm output formats so the parsers are
 * exercised against realistic text, not idealized strings.
 */

/** `rpicam-hello --list-cameras` — two imx290 CSI cameras (real Argus board output). */
export const RPICAM_LIST = `Available cameras
-----------------
0 : imx290 [1920x1080 12-bit RGGB] (/base/axi/pcie@1000120000/rp1/i2c@88000/imx290@1a)
    Modes: 'SRGGB10_CSI2P' : 1280x720 [60.00 fps - (320, 180)/1280x720 crop]
                             1920x1080 [60.00 fps - (0, 0)/1920x1080 crop]
           'SRGGB12_CSI2P' : 1280x720 [60.00 fps - (320, 180)/1280x720 crop]
                             1920x1080 [60.00 fps - (0, 0)/1920x1080 crop]

1 : imx290 [1920x1080 12-bit RGGB] (/base/axi/pcie@1000120000/rp1/i2c@70000/imx290@1a)
    Modes: 'SRGGB10_CSI2P' : 1280x720 [60.00 fps - (320, 180)/1280x720 crop]
                             1920x1080 [60.00 fps - (0, 0)/1920x1080 crop]
           'SRGGB12_CSI2P' : 1280x720 [60.00 fps - (320, 180)/1280x720 crop]
                             1920x1080 [60.00 fps - (0, 0)/1920x1080 crop]
`;

/** `rpicam-hello --list-cameras` when no cameras are detected. */
export const RPICAM_LIST_EMPTY = `No cameras available!
`;

/** `v4l2-ctl --list-devices` — the UVC camera (ELP SC2210). Tabs precede nodes. */
export const V4L2_LIST_DEVICES = `HD USB Camera: HD USB Camera (usb-xhci-hcd.1-1.1):
\t/dev/video8
\t/dev/video9
\t/dev/media5
`;

/** `v4l2-ctl -d /dev/video8 --list-formats-ext` — the capture node (MJPG + YUYV). */
export const V4L2_FORMATS = `ioctl: VIDIOC_ENUM_FMT
\tType: Video Capture

\t[0]: 'MJPG' (Motion-JPEG, compressed)
\t\tSize: Discrete 1920x1080
\t\t\tInterval: Discrete 0.017s (60.000 fps)
\t\t\tInterval: Discrete 0.033s (30.000 fps)
\t\tSize: Discrete 1280x720
\t\t\tInterval: Discrete 0.017s (60.000 fps)
\t[1]: 'YUYV' (YUYV 4:2:2)
\t\tSize: Discrete 1920x1080
\t\t\tInterval: Discrete 0.200s (5.000 fps)
\t\tSize: Discrete 1280x720
\t\t\tInterval: Discrete 0.100s (10.000 fps)
`;

/** `v4l2-ctl -d /dev/video9 --list-formats-ext` — the metadata node (no capture sizes). */
export const V4L2_FORMATS_META = `ioctl: VIDIOC_ENUM_FMT
\tType: Metadata Capture

\t[0]: 'UVCH' (UVC Payload Header Metadata)
`;

/** `lsusb` line for the SIM7600 modem + the UVC webcam (plus noise). */
export const LSUSB = `Bus 003 Device 002: ID 1e0e:9011 Qualcomm / Option SimTech, Incorporated
Bus 004 Device 003: ID 32e4:2210 USB Cam Manufacturer HD USB Camera
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

/** Alternate strap: BNO085 at 0x4b, BMS removed (matches a real eval board). */
export const I2CDETECT_4B = `     0  1  2  3  4  5  6  7  8  9  a  b  c  d  e  f
00:                         -- -- -- -- -- -- -- --
10: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
20: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
30: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
40: -- -- -- -- -- -- -- -- -- -- -- 4b -- -- -- --
50: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
60: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
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
/** Freshly booted pin, never driven: function "none", no level. */
export const PINCTRL_GET_NONE = "12: no    pd | -- // GPIO12 = none";
