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

// Arrow keys are escape sequences; send one per data event with a tick between.
const ARROW = { up: "[A", down: "[B" } as const;
async function pressArrow(
  stdin: { write: (s: string) => void },
  dir: keyof typeof ARROW,
  times = 1,
) {
  for (let i = 0; i < times; i++) {
    stdin.write(ARROW[dir]);
    await delay(20);
  }
}

// Force the HAL into fixture mode so the UI is deterministic on any host.
beforeAll(() => {
  process.env.ARGUS_MOCK = "1";
});

describe("UI smoke (mock mode)", () => {
  it("renders the master-detail dashboard with all modules listed", async () => {
    const { lastFrame, unmount } = render(<App />);
    await delay(150);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("ARGUS Test Bench");
    expect(frame).toContain("Dashboard");
    // The left list pins every module at once…
    expect(frame).toContain("LTE / GNSS");
    expect(frame).toContain("IMU");
    expect(frame).toContain("RGB LED");
    expect(frame).toContain("Microphone");
    expect(frame).toContain("Cameras");
    // …and the right pane previews the default selection (LTE), not the others.
    expect(frame).toContain("Signal"); // LTE detail body
    expect(frame).not.toContain("imx290"); // Camera detail hidden
    expect(frame).not.toContain("BNO085"); // IMU detail hidden
    unmount();
  });

  it("↓ changes which module the detail pane previews", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await delay(120);
    expect(lastFrame()).not.toContain("imx290"); // LTE selected, Camera hidden
    // LTE → Cameras (index 1).
    await pressArrow(stdin, "down", 1);
    await delay(60);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("imx290"); // Camera detail now shown
    expect(frame).not.toContain("Signal"); // LTE detail hidden
    unmount();
  });

  it("Enter operates the selected module (process runs in the detail pane)", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await delay(120);
    await pressArrow(stdin, "down", 3); // select IMU
    await delay(20);
    stdin.write("\r"); // enter the detail to operate it
    await delay(20);
    stdin.write("d"); // start the live stream
    await delay(200);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("euler");
    expect(frame).toContain("m/s²");
    unmount();
  });

  it("keeps the IMU stream running after leaving and navigating away", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await delay(120);
    await pressArrow(stdin, "down", 3); // select IMU
    await delay(20);
    stdin.write("\r"); // operate
    await delay(20);
    stdin.write("d"); // start the live stream
    await delay(200);
    expect(lastFrame()).toContain("euler");
    // Esc returns to the list WITHOUT stopping the stream.
    stdin.write("");
    await delay(40);
    expect(lastFrame()).toContain("select"); // back at the list (LIST_HINTS footer)
    // Navigate to another module → IMU detail hidden.
    await pressArrow(stdin, "down", 1); // select RGB LED
    await delay(40);
    expect(lastFrame()).not.toContain("euler");
    // Come back → the stream is still running.
    await pressArrow(stdin, "up", 1); // back to IMU
    await delay(60);
    expect(lastFrame()).toContain("euler");
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
