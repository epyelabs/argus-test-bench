import { useState } from "react";
import { useApp, useInput } from "ink";
import { HomeScreen } from "./screens/HomeScreen.js";
import { CameraScreen } from "./screens/CameraScreen.js";
import { LteScreen } from "./screens/LteScreen.js";
import { ImuScreen } from "./screens/ImuScreen.js";
import { MicScreen } from "./screens/MicScreen.js";
import { LedScreen } from "./screens/LedScreen.js";

export type Screen = "home" | "camera" | "lte" | "imu" | "mic" | "led";

export function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const { exit } = useApp();
  const back = () => setScreen("home");

  // From the home menu, `q` quits the app outright.
  useInput((input) => {
    if (screen === "home" && (input === "q" || input === "Q")) exit();
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
    default:
      return <HomeScreen onSelect={setScreen} />;
  }
}
