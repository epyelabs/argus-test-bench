import { Box, Text } from "ink";

/**
 * Horizontal audio level meter. `level` and `peak` are 0..1.
 * Green/yellow/red zones give a quick read on input gain during mic capture.
 */
export function LevelMeter({
  level,
  peak,
  width = 40,
  label,
}: {
  level: number;
  peak?: number;
  width?: number;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(1, level));
  const filled = Math.round(clamped * width);
  const peakPos = peak !== undefined ? Math.round(Math.max(0, Math.min(1, peak)) * width) : -1;

  const cells: { char: string; color: string }[] = [];
  for (let i = 0; i < width; i++) {
    const frac = i / width;
    const color = frac > 0.85 ? "red" : frac > 0.6 ? "yellow" : "green";
    if (i === peakPos && i >= filled) {
      cells.push({ char: "│", color });
    } else if (i < filled) {
      cells.push({ char: "█", color });
    } else {
      cells.push({ char: " ", color: "gray" });
    }
  }

  return (
    <Box>
      {label ? <Text color="white">{label} </Text> : null}
      <Text>[</Text>
      {cells.map((c, i) => (
        <Text key={i} color={c.color}>
          {c.char}
        </Text>
      ))}
      <Text>] </Text>
      <Text color="gray">{Math.round(clamped * 100)}%</Text>
    </Box>
  );
}
