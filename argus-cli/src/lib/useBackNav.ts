import { useInput } from "ink";

/**
 * Bind Esc / q / Backspace to a "go back" action.
 *
 * `enabled` lets a screen suspend back-nav while a text field is focused
 * (so typing "q" doesn't bounce to the menu). Esc always works.
 */
export function useBackNav(onBack: () => void, enabled = true) {
  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (enabled && (input === "q" || input === "Q")) onBack();
  });
}
