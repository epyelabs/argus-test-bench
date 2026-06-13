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
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
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
