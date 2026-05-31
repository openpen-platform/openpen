/**
 * Pure desired-state derivation for the Linux/Wayland window set.
 *
 * Kept free of Electron imports so the desired-set rules — the spine of the
 * single-coordinator model in window-manager.js — can be unit-tested in
 * isolation. reconcileLinuxWindows() applies the result by diffing against the
 * actual windows.
 */

/**
 * Derive a display's desired Wayland window state from the current mode tuple.
 *
 * Rules:
 *   - Only the active display shows anything.
 *   - `barHidden` (toggleBar shortcut / tray hide) gates ONLY the bar — NEVER the
 *     overlay, so a drawing surface can never be hidden out from under an active
 *     drawing session.
 *   - `settingsOpen` hides both (the settings window dims the controls).
 *
 * @param {{ displayId: number, activeId: number, drawing: boolean, settingsOpen: boolean, barHidden: boolean }} s
 * @returns {{ showBar: boolean, wantOverlay: boolean }}
 */
export function deriveLinuxWindowState({ displayId, activeId, drawing, settingsOpen, barHidden }) {
  const isActive = displayId === activeId;
  return {
    showBar: isActive && !drawing && !settingsOpen && !barHidden,
    wantOverlay: isActive && drawing && !settingsOpen,
  };
}
