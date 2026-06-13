import { describe, expect, it } from "vitest";
import { parseImuLine } from "../src/hardware/imu.js";
import { quatToEuler } from "../src/lib/orientation.js";
import { signedFixed } from "../src/lib/format.js";

describe("parseImuLine", () => {
  it("parses a sample message", () => {
    const msg = parseImuLine(
      '{"type":"sample","quat":{"r":0.853,"i":-0.162,"j":-0.331,"k":-0.370},"linaccel":{"x":0.01,"y":0,"z":0}}',
    );
    expect(msg).toMatchObject({ type: "sample" });
    if (msg?.type === "sample") {
      expect(msg.quat.r).toBeCloseTo(0.853, 3);
      expect(msg.linaccel.x).toBeCloseTo(0.01, 3);
    }
  });

  it("parses ready and error messages", () => {
    expect(parseImuLine('{"type":"ready","address":"0x4b"}')).toMatchObject({ type: "ready" });
    expect(parseImuLine('{"type":"error","error":"import failed"}')).toMatchObject({
      type: "error",
      error: "import failed",
    });
  });

  it("ignores non-JSON / partial lines", () => {
    expect(parseImuLine("Traceback (most recent call last):")).toBeNull();
    expect(parseImuLine('{"type":"unknown"}')).toBeNull();
    expect(parseImuLine("")).toBeNull();
  });
});

describe("quatToEuler", () => {
  it("identity quaternion is level", () => {
    const e = quatToEuler({ r: 1, i: 0, j: 0, k: 0 });
    expect(e.roll).toBeCloseTo(0, 5);
    expect(e.pitch).toBeCloseTo(0, 5);
    expect(e.yaw).toBeCloseTo(0, 5);
  });

  it("90° rotation about Z reads as yaw 90", () => {
    const e = quatToEuler({ r: Math.SQRT1_2, i: 0, j: 0, k: Math.SQRT1_2 });
    expect(e.yaw).toBeCloseTo(90, 3);
    expect(e.roll).toBeCloseTo(0, 5);
    expect(e.pitch).toBeCloseTo(0, 5);
  });
});

describe("signedFixed", () => {
  it("always shows a sign", () => {
    expect(signedFixed(0.853, 3)).toBe("+0.853");
    expect(signedFixed(-0.04, 2)).toBe("-0.04");
    expect(signedFixed(0, 2)).toBe("+0.00");
  });
});
