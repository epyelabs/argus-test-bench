import { Box, Text, useApp } from "ink";
import SelectInput from "ink-select-input";
import { Header } from "../components/Header.js";
import { KeyHints } from "../components/KeyHints.js";
import type { Screen } from "../app.js";

interface Item {
  label: string;
  value: Screen | "quit";
}

const ITEMS: Item[] = [
  { label: "📷  Cameras       — list, snapshot, record (CSI)", value: "camera" },
  { label: "📡  LTE / GNSS    — modem status, signal, GPS", value: "lte" },
  { label: "🧭  IMU           — BNO085 detection", value: "imu" },
  { label: "🎙  Microphone    — detect, record, level meter", value: "mic" },
  { label: "💡  RGB LED       — toggle R / G / B", value: "led" },
  { label: "🚪  Quit", value: "quit" },
];

export function HomeScreen({ onSelect }: { onSelect: (s: Screen) => void }) {
  const { exit } = useApp();

  return (
    <Box flexDirection="column">
      <Header title="Main Menu" />
      <Box paddingX={1} flexDirection="column">
        <Text color="gray">Select a module to test:</Text>
        <Box marginTop={1}>
          <SelectInput
            items={ITEMS}
            onSelect={(item) => {
              if (item.value === "quit") exit();
              else onSelect(item.value);
            }}
          />
        </Box>
      </Box>
      <KeyHints
        hints={[
          { keys: "↑↓", label: "move" },
          { keys: "↵", label: "select" },
          { keys: "q", label: "quit" },
        ]}
      />
    </Box>
  );
}
