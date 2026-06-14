import { Box, Text } from "ink";

/** Scrolling tail of command output (keeps the last `maxLines`). */
export function LogView({
  lines,
  maxLines = 8,
  title = "Output",
}: {
  lines: string[];
  maxLines?: number;
  title?: string;
}) {
  const tail = lines.slice(-maxLines);
  return (
    // width 100% so it fills the pane (parent is a row) and truncate-end has a
    // width to clamp to, instead of growing to the widest log line.
    <Box width="100%" flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      <Text color="gray">{title}</Text>
      {tail.length === 0 ? (
        <Text color="gray" dimColor>
          (no output yet)
        </Text>
      ) : (
        tail.map((line, i) => (
          <Text key={i} wrap="truncate-end">
            {line}
          </Text>
        ))
      )}
    </Box>
  );
}
