import { describe, expect, it } from "vitest";
import {
  encoderHint,
  matchUsbId,
  maxFps,
  parseCameraList,
  parseV4l2Devices,
  parseV4l2Formats,
} from "../src/hardware/camera.js";
import { findModemLine } from "../src/hardware/lte.js";
import { findImuAddress, parseI2cDetect } from "../src/hardware/imu.js";
import {
  parseArecordList,
  levelFromS16,
  levelFromS32,
  s32StereoToMonoS16,
  encodeWavPcm16,
} from "../src/hardware/mic.js";
import { parsePinctrlLevel } from "../src/hardware/led.js";
import { IMU, LTE, MIC } from "../src/config/hardware.js";
import {
  ARECORD_L,
  ARECORD_L_NONE,
  I2CDETECT,
  I2CDETECT_4B,
  LSUSB,
  V4L2_FORMATS,
  V4L2_FORMATS_META,
  V4L2_LIST_DEVICES,
  LSUSB_NO_MODEM,
  PINCTRL_GET_HIGH,
  PINCTRL_GET_LOW,
  PINCTRL_GET_NONE,
  RPICAM_LIST,
  RPICAM_LIST_EMPTY,
} from "../src/mocks/fixtures.js";

describe("parseCameraList", () => {
  it("parses sensor metadata from the header bracket", () => {
    const cams = parseCameraList(RPICAM_LIST);
    expect(cams).toHaveLength(2);
    expect(cams[0]).toMatchObject({
      kind: "csi",
      index: 0,
      name: "imx290",
      maxResolution: "1920x1080",
      bitDepth: "12-bit",
      bayer: "RGGB",
      bus: "i2c@88000",
    });
  });

  it("distinguishes the two CSI ports by i2c bus", () => {
    const cams = parseCameraList(RPICAM_LIST);
    expect(cams[0].bus).toBe("i2c@88000");
    expect(cams[1].bus).toBe("i2c@70000");
  });

  it("parses per-format modes with fps, skipping crop sizes", () => {
    const cam = parseCameraList(RPICAM_LIST)[0];
    expect(cam.modes).toContainEqual({ format: "SRGGB10_CSI2P", resolution: "1280x720", fps: 60 });
    expect(cam.modes).toContainEqual({ format: "SRGGB12_CSI2P", resolution: "1920x1080", fps: 60 });
    // 2 formats × 2 resolutions, and no phantom modes from the crop "1280x720" tokens.
    expect(cam.modes).toHaveLength(4);
  });

  it("reports the max frame rate", () => {
    expect(maxFps(parseCameraList(RPICAM_LIST)[0])).toBe(60);
  });

  it("turns rpicam-vid codec errors into install guidance", () => {
    expect(encoderHint("ERROR: *** Unrecognised codec libav ***")).toMatch(/sudo apt install rpicam-apps/);
    expect(encoderHint("ERROR: *** Unable to find an appropriate H.264 codec ***")).toMatch(
      /sudo apt install rpicam-apps/,
    );
    expect(encoderHint("[2:01] INFO Camera configuring streams")).toBeNull();
  });

  it("returns empty for 'No cameras available!'", () => {
    expect(parseCameraList(RPICAM_LIST_EMPTY)).toEqual([]);
  });

  it("turns ffmpeg/V4L2 errors into actionable hints", () => {
    expect(encoderHint("[video4linux2 @ 0x...] /dev/video8: Device or resource busy")).toMatch(
      /busy/i,
    );
    expect(encoderHint("Cannot open '/dev/video8': No such file or directory")).toMatch(
      /V4L2 device/i,
    );
  });
});

describe("UVC (V4L2) parsers", () => {
  it("parseV4l2Devices groups video nodes per device (drops media/vbi)", () => {
    const devs = parseV4l2Devices(V4L2_LIST_DEVICES);
    expect(devs).toHaveLength(1);
    expect(devs[0].name).toBe("HD USB Camera");
    expect(devs[0].nodes).toEqual(["/dev/video8", "/dev/video9"]);
  });

  it("parseV4l2Formats yields one mode per format+size with max fps", () => {
    const modes = parseV4l2Formats(V4L2_FORMATS);
    expect(modes).toContainEqual({ format: "MJPG", resolution: "1920x1080", fps: 60 });
    expect(modes).toContainEqual({ format: "YUYV", resolution: "1280x720", fps: 10 });
    expect(modes).toHaveLength(4);
    expect(maxFps({ kind: "uvc", index: 8, name: "x", modes })).toBe(60);
  });

  it("parseV4l2Formats returns no modes for the metadata node", () => {
    expect(parseV4l2Formats(V4L2_FORMATS_META)).toEqual([]);
  });

  it("matchUsbId finds the camera's USB id by name", () => {
    expect(matchUsbId(LSUSB, "HD USB Camera")).toBe("32e4:2210");
    expect(matchUsbId(LSUSB, "Nonexistent Cam")).toBeUndefined();
  });
});

describe("findModemLine", () => {
  it("finds the SIM7600 by vendor:product", () => {
    const m = findModemLine(LSUSB, LTE.usbVendorId, LTE.usbProductIds);
    expect(m?.usbId).toBe("1e0e:9011");
    expect(m?.description).toMatch(/SimTech/i);
  });

  it("returns null when the modem is absent", () => {
    expect(findModemLine(LSUSB_NO_MODEM, LTE.usbVendorId, LTE.usbProductIds)).toBeNull();
  });
});

describe("parseI2cDetect", () => {
  it("detects the IMU and BMS addresses", () => {
    const addrs = parseI2cDetect(I2CDETECT);
    expect(addrs).toContain(0x4a);
    expect(addrs).toContain(IMU.bmsAddress); // 0x6b
  });

  it("ignores reserved cells and produces no phantom addresses", () => {
    const addrs = parseI2cDetect(I2CDETECT);
    expect(addrs).toEqual([0x4a, IMU.bmsAddress]);
  });

  it("reads the alternate strap (BNO085 at 0x4b)", () => {
    expect(parseI2cDetect(I2CDETECT_4B)).toEqual([0x4b]);
  });
});

describe("findImuAddress", () => {
  it("accepts either strap address", () => {
    expect(findImuAddress([0x4a, 0x6b])).toBe(0x4a);
    expect(findImuAddress([0x4b])).toBe(0x4b);
  });
  it("returns null when the IMU is absent", () => {
    expect(findImuAddress([0x6b])).toBeNull();
  });
});

describe("parseArecordList", () => {
  it("lists cards and flags the I2S mic (not HDMI)", () => {
    const devs = parseArecordList(ARECORD_L, MIC.cardHints);
    expect(devs).toHaveLength(2);
    const hdmi = devs.find((d) => d.cardId === "vc4hdmi");
    const mic = devs.find((d) => d.cardId === "sph0645");
    expect(hdmi?.isMic).toBe(false);
    expect(mic?.isMic).toBe(true);
    expect(mic).toMatchObject({ card: 2, device: 0 });
  });

  it("returns empty when there are no capture devices", () => {
    expect(parseArecordList(ARECORD_L_NONE, MIC.cardHints)).toEqual([]);
  });
});

describe("parsePinctrlLevel", () => {
  it("reads hi / lo", () => {
    expect(parsePinctrlLevel(PINCTRL_GET_HIGH)).toBe(true);
    expect(parsePinctrlLevel(PINCTRL_GET_LOW)).toBe(false);
  });
  it("treats a freshly booted undriven pin (none, --) as off", () => {
    expect(parsePinctrlLevel(PINCTRL_GET_NONE)).toBe(false);
  });
  it("returns null on unparseable output", () => {
    expect(parsePinctrlLevel("nonsense")).toBeNull();
  });
});

describe("levelFromS16", () => {
  it("computes full-scale peak and rms from max samples", () => {
    const buf = Buffer.alloc(4);
    buf.writeInt16LE(32767, 0);
    buf.writeInt16LE(-32768, 2);
    const { rms, peak } = levelFromS16(buf);
    expect(peak).toBeGreaterThan(0.99);
    expect(rms).toBeGreaterThan(0.99);
  });
  it("returns zero for an empty buffer", () => {
    expect(levelFromS16(Buffer.alloc(0))).toEqual({ rms: 0, peak: 0 });
  });
});

describe("levelFromS32 (gain + louder-channel)", () => {
  it("amplifies a quiet signal by the gain", () => {
    // One stereo frame: left ~1/16 full-scale, right silent.
    const buf = Buffer.alloc(8);
    buf.writeInt32LE(Math.round(2147483648 / 16), 0);
    buf.writeInt32LE(0, 4);
    const ungained = levelFromS32(buf, 1, 2);
    const gained = levelFromS32(buf, 16, 2);
    expect(gained.peak).toBeGreaterThan(ungained.peak * 10);
    expect(gained.peak).toBeCloseTo(1, 2); // 1/16 * 16 ≈ full scale
  });

  it("picks the channel that actually carries signal", () => {
    // Mic on the RIGHT channel, left silent — must not read as silence.
    const buf = Buffer.alloc(8);
    buf.writeInt32LE(0, 0);
    buf.writeInt32LE(Math.round(2147483648 / 8), 4);
    expect(levelFromS32(buf, 1, 2).peak).toBeGreaterThan(0.1);
  });
});

describe("s32StereoToMonoS16", () => {
  it("downmixes the louder channel with gain into 16-bit", () => {
    const buf = Buffer.alloc(8 * 2); // two frames
    // Right channel carries a small signal; left is silent.
    buf.writeInt32LE(0, 0);
    buf.writeInt32LE(Math.round(2147483648 / 1000), 4);
    buf.writeInt32LE(0, 8);
    buf.writeInt32LE(Math.round(2147483648 / 1000), 12);
    const mono = s32StereoToMonoS16(buf, 16, 2);
    expect(mono).toHaveLength(2);
    // (2^31/1000 / 65536) * 16 ≈ 524 — audible, and well within int16 range.
    expect(mono[0]).toBeGreaterThan(100);
    expect(mono[0]).toBeLessThan(32768);
  });

  it("clamps rather than wrapping on overload", () => {
    const buf = Buffer.alloc(8);
    buf.writeInt32LE(2147483647, 0);
    buf.writeInt32LE(0, 4);
    expect(s32StereoToMonoS16(buf, 64, 2)[0]).toBe(32767);
  });
});

describe("encodeWavPcm16", () => {
  it("writes a valid canonical WAV header", () => {
    const wav = encodeWavPcm16(Int16Array.from([0, 1000, -1000, 32767]), 48000);
    expect(wav.length).toBe(44 + 4 * 2);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.toString("ascii", 36, 40)).toBe("data");
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(48000); // sample rate
    expect(wav.readUInt16LE(34)).toBe(16); // bits per sample
    expect(wav.readUInt32LE(40)).toBe(8); // data bytes
    expect(wav.readInt16LE(44 + 2)).toBe(1000);
  });
});
