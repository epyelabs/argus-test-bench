import { useState } from "react";
import { useApp, useInput } from "ink";
import { DashboardScreen } from "./screens/DashboardScreen.js";
import { HomeScreen } from "./screens/HomeScreen.js";
import { CameraScreen } from "./screens/CameraScreen.js";
import { LteScreen } from "./screens/LteScreen.js";
import { ImuScreen } from "./screens/ImuScreen.js";
import { MicScreen } from "./screens/MicScreen.js";
import { LedScreen } from "./screens/LedScreen.js";

export type Screen = "dashboard" | "home" | "camera" | "lte" | "imu" | "mic" | "led";

export function App() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const { exit } = useApp();
  const back = () => setScreen("dashboard");

  // From the dashboard, `q` quits the app outright. No panel consumes `q`, so
  // this never collides with a focused section's keys.
  useInput((input) => {
    if (screen === "dashboard" && (input === "q" || input === "Q")) exit();
  });

  switch (screen) {
    case "camera":
      return <CameraScreen onBack={back} />;
    case "lte":
      return <LteScreen onBack={back} />;
    case "imu":
      return <ImuScreen onBack={back} />;
    case "mic":
      return <MicScreen onBack={back} />;
    case "led":
      return <LedScreen onBack={back} />;
    case "home":
      return <HomeScreen onSelect={setScreen} />;
    case "dashboard":
    default:
      return <DashboardScreen onOpen={setScreen} />;
  }
}
