import { Box, Text } from "ink";

/**
 * Bordered section wrapper used by every dashboard panel. The border turns
 * cyan when the panel is focused so the user can see which section keys act on.
 */
export function PanelFrame({
  title,
  isFocused,
  children,
}: {
  title: string;
  isFocused: boolean;
  children: React.ReactNode;
}) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={isFocused ? "cyan" : "gray"}
      paddingX={1}
    >
      <Text bold color={isFocused ? "cyan" : "white"}>
        {isFocused ? "▶ " : "  "}
        {title}
      </Text>
      {children}
    </Box>
  );
}
