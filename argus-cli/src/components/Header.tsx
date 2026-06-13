import { Box, Text } from "ink";
import { BOARD_NAME } from "../config/hardware.js";
import { hostLabel, isMock } from "../lib/platform.js";

/** Persistent title bar shown at the top of every screen. */
export function Header({ title }: { title: string }) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      marginBottom={1}
    >
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          ARGUS Test Bench
        </Text>
        <Text color={isMock() ? "yellow" : "green"}>{hostLabel()}</Text>
      </Box>
      <Box justifyContent="space-between">
        <Text color="gray">{BOARD_NAME}</Text>
        <Text color="white">{title}</Text>
      </Box>
    </Box>
  );
}
