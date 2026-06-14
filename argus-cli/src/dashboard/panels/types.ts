import type { Screen } from "../../app.js";
import type { Hint } from "../../components/KeyHints.js";

/** Shared contract for every dashboard panel. */
export interface PanelProps {
  /** Stable id for Ink's useFocus (also the module the panel represents). */
  focusId: string;
  /** First panel gets autoFocus so something is focused on landing. */
  autoFocus?: boolean;
  /** Drill into the module's full-screen view (heavy interactive flows). */
  onOpen: (module: Screen) => void;
  /** Publish this panel's key hints to the dashboard footer while focused. */
  onHints: (hints: Hint[]) => void;
}
