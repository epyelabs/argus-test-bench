import type { Hint } from "../components/KeyHints.js";
import type { Status } from "../components/StatusBadge.js";

/** Compact one-line status a module reports up to its left-list row. */
export interface ModuleStatus {
  label: string;
  status: Status;
}

/**
 * Contract for a screen embedded in the master-detail dashboard.
 *
 * All five module views stay mounted at once so their streams/polls keep
 * running while you switch (return null when not `visible`, but keep the
 * effects alive). Only the `active` view receives keyboard input.
 *
 * Defaults keep the screens directly renderable in tests:
 * `render(<ImuScreen onBack={noop} />)` shows the body and accepts input.
 */
export interface ModuleViewProps {
  /** Is this the selected module? When false the view renders null. */
  visible?: boolean;
  /** visible && operating — does this view receive keyboard input? */
  active?: boolean;
  /** Report a compact live status for the left-list row. */
  onStatus?: (s: ModuleStatus) => void;
  /** Publish contextual key hints for the footer while active. */
  onHints?: (h: Hint[]) => void;
  /** Back key pressed — dashboard returns focus to the list. */
  onExit?: () => void;
  /** Legacy alias for onExit, kept so direct-render tests still compile. */
  onBack?: () => void;
}

export const noop = () => {};
