import { Box, Text } from "ink";

export interface Column<T> {
  header: string;
  /** Cell text for a row. */
  cell: (row: T) => string;
  /** Fixed column width; defaults to fit content + header. */
  width?: number;
}

/**
 * Minimal fixed-column table built from Box/Text.
 *
 * We render tables by hand rather than depend on `ink-table`, which has had
 * recurring ESM/peer-dependency breakage. This is intentionally tiny.
 */
export function Table<T>({ columns, rows }: { columns: Column<T>[]; rows: T[] }) {
  const widths = columns.map((col) => {
    if (col.width) return col.width;
    const body = rows.length ? Math.max(...rows.map((r) => col.cell(r).length)) : 0;
    return Math.max(col.header.length, body) + 2;
  });

  const pad = (s: string, w: number) => (s.length > w ? s.slice(0, w - 1) + "…" : s.padEnd(w));

  return (
    <Box flexDirection="column">
      <Box>
        {columns.map((col, i) => (
          <Text key={col.header} bold color="cyan">
            {pad(col.header, widths[i])}
          </Text>
        ))}
      </Box>
      {rows.map((row, ri) => (
        <Box key={ri}>
          {columns.map((col, ci) => (
            <Text key={col.header}>{pad(col.cell(row), widths[ci])}</Text>
          ))}
        </Box>
      ))}
    </Box>
  );
}
