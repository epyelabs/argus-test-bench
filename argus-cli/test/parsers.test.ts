import { describe, expect, it } from "vitest";
import { parseCameraList } from "../src/hardware/camera.js";
import { findModemLine } from "../src/hardware/lte.js";
import { findImuAddress, parseI2cDetect } from "../src/hardware/imu.js";
import { parseArecordList, levelFromS16 } from "../src/hardware/mic.js";
import { parsePinctrlLevel } from "../src/hardware/led.js";
import { IMU, LTE, MIC } from "../src/config/hardware.js";
import {
  ARECORD_L,
  ARECORD_L_NONE,
  I2CDETECT,
  I2CDETECT_4B,
  LSUSB,
  LSUSB_NO_MODEM,
  PINCTRL_GET_HIGH,
  PINCTRL_GET_LOW,
  RPICAM_LIST,
  RPICAM_LIST_EMPTY,
} from "../src/mocks/fixtures.js";

describe("parseCameraList", () => {
  it("parses two CSI cameras with modes", () => {
    const cams = parseCameraList(RPICAM_LIST);
    expect(cams).toHaveLength(2);
    expect(cams[0]).toMatchObject({ index: 0, name: "imx708", maxResolution: "4608x2592" });
    expect(cams[0].modes).toContain("1536x864");
    expect(cams[1]).toMatchObject({ index: 1, name: "ov5647" });
    expect(cams[0].devicePath).toContain("imx708");
  });

  it("returns empty for 'No cameras available!'", () => {
    expect(parseCameraList(RPICAM_LIST_EMPTY)).toEqual([]);
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
