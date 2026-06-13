import { Text } from "ink";

export type Status = "ok" | "warn" | "error" | "unknown" | "busy";

const STYLE: Record<Status, { color: string; label: string }> = {
  ok: { color: "green", label: "●" },
  warn: { color: "yellow", label: "●" },
  error: { color: "red", label: "●" },
  unknown: { color: "gray", label: "○" },
  busy: { color: "cyan", label: "◍" },
};

/** Small colored dot + text, used for "present / absent / busy" rows. */
export function StatusBadge({ status, children }: { status: Status; children: React.ReactNode }) {
  const s = STYLE[status];
  return (
    <Text>
      <Text color={s.color}>{s.label} </Text>
      {children}
    </Text>
  );
}
