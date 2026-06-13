import { Box, Text } from "ink";

export interface Hint {
  keys: string;
  label: string;
}

/** Footer line listing the active key bindings for a screen. */
export function KeyHints({ hints }: { hints: Hint[] }) {
  return (
    <Box marginTop={1}>
      {hints.map((h, i) => (
        <Text key={h.keys} color="gray">
          {i > 0 ? "   " : ""}
          <Text color="cyan">{h.keys}</Text> {h.label}
        </Text>
      ))}
    </Box>
  );
}
