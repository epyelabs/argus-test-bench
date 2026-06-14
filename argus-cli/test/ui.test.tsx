import { beforeAll, describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { App } from "../src/app.js";
import { CameraScreen } from "../src/screens/CameraScreen.js";
import { LteScreen } from "../src/screens/LteScreen.js";
import { ImuScreen } from "../src/screens/ImuScreen.js";
import { MicScreen } from "../src/screens/MicScreen.js";
import { LedScreen } from "../src/screens/LedScreen.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const noop = () => {};

// Force the HAL into fixture mode so the UI is deterministic on any host.
beforeAll(() => {
  process.env.ARGUS_MOCK = "1";
});

describe("UI smoke (mock mode)", () => {
  it("renders the home menu", async () => {
    const { lastFrame, unmount } = render(<App />);
    await delay(30);
    expect(lastFrame()).toContain("ARGUS Test Bench");
    expect(lastFrame()).toContain("Cameras");
    expect(lastFrame()).toContain("RGB LED");
    unmount();
  });

  it("camera screen lists both CSI and UVC sources", async () => {
    const { lastFrame, unmount } = render(<CameraScreen onBack={noop} />);
    await delay(80);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("imx290"); // CSI
    expect(frame).toContain("i2c@88000"); // CSI ports distinguishable
    expect(frame).toContain("i2c@70000");
    expect(frame).toContain("HD USB Camera"); // UVC
    expect(frame).toContain("/dev/video8"); // UVC capture node
    expect(frame).toMatch(/UVC/); // Type column
    unmount();
  });

  it("LTE screen shows modem + live telemetry", async () => {
    const { lastFrame, unmount } = render(<LteScreen onBack={noop} />);
    await delay(80);
    const frame = lastFrame() ?? "";
    expect(frame).toMatch(/SimTech/i);
    expect(frame).toContain("connected");
    expect(frame).toContain("CSQ 18");
    unmount();
  });

  it("LTE screen reads a GPS fix on 'g'", async () => {
    const { lastFrame, stdin, unmount } = render(<LteScreen onBack={noop} />);
    await delay(40);
    stdin.write("g");
    await delay(60);
    expect(lastFrame()).toContain("14.50");
    unmount();
  });

  it("IMU screen detects the BNO085", async () => {
    const { lastFrame, unmount } = render(<ImuScreen onBack={noop} />);
    await delay(60);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("BNO085");
    expect(frame).toMatch(/0x4a/i);
    expect(frame).toContain("present");
    unmount();
  });

  it("IMU screen streams live motion data on 'd'", async () => {
    const { lastFrame, stdin, unmount } = render(<ImuScreen onBack={noop} />);
    await delay(60);
    stdin.write("d");
    await delay(150);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("quat");
    expect(frame).toContain("euler");
    expect(frame).toContain("m/s²");
    unmount();
  });

  it("mic screen lists capture devices and flags the I2S mic", async () => {
    const { lastFrame, unmount } = render(<MicScreen onBack={noop} />);
    await delay(60);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("sph0645");
    expect(frame).toMatch(/I2S mic/i);
    unmount();
  });

  it("LED screen renders all three channels", async () => {
    const { lastFrame, unmount } = render(<LedScreen onBack={noop} />);
    await delay(40);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("RED");
    expect(frame).toContain("GREEN");
    expect(frame).toContain("BLUE");
    unmount();
  });
});
