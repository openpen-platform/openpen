---
title: 'Linux & Wayland support'
description: What works on Linux, the differences between X11/Xorg and native Wayland sessions, and how to get the full OpenPen experience on Linux.
---

# Linux & Wayland support

OpenPen runs on Linux, with **conditional support** that depends on your display
session:

- **X11 / Xorg session** — full experience, identical to macOS and Windows
  (floating ball, expand/collapse, drag-to-snap, pinning, vertical bar).
- **Native Wayland session** (GNOME, target 46+) — a working but **reduced**
  experience: a fixed, always-on control bar instead of the floating ball.

This is a deliberate adaptation to compositor constraints, not an unfinished
port. On Wayland, OpenPen behaves like a pragmatic screen-annotation tool rather
than the full floating-ball UX.

---

## Which session am I running?

```bash
echo "$XDG_SESSION_TYPE"   # → "x11" or "wayland"
```

If you want the full experience, log in to an **Xorg** session (see
[Getting the full experience](#getting-the-full-experience-on-linux) below).

---

## Feature support matrix

| Capability | X11 / Xorg | Native Wayland (GNOME) |
| --- | --- | --- |
| Drawing overlay (freehand / line / shape) | ✅ | ✅ |
| Stroke width, color, highlight mode | ✅ | ✅ |
| Floating ball | ✅ | ❌ (fixed control bar instead) |
| Drag the ball / snap to edge / pinning | ✅ | ❌ |
| Collapse to ball / vertical bar layout | ✅ | ❌ |
| Control bar position | Follows the ball | Fixed, top-left, always shown |
| Hide the control bar (free the footprint) | ✅ | ✅ — `Ctrl + Shift + \` or tray |
| Keyboard shortcuts | ✅ | ✅ — GNOME only |
| Cursor-relative actions (summon to cursor) | ✅ | ❌ |
| Multi-monitor | ✅ | ⚠️ Bar lives on the active screen; no cross-screen drag |

---

## Wayland limitations in detail

On a native Wayland session:

- **No floating ball.** The control bar is a fixed-size window pinned to the
  top-left corner and is always shown. You cannot drag it, collapse it to a
  ball, pin it, or switch it to the vertical layout.
- **The bar occupies its footprint.** Because the bar window cannot be made
  click-through on Wayland, the area it covers is not interactive for the apps
  beneath it. Hide the bar with **`Ctrl + Shift + \`** (default) or the tray
  menu when you need that space, and show it again the same way.
- **Shortcuts are GNOME-only.** OpenPen registers its toggles (toggle drawing
  mode, hide bar) as GNOME custom key bindings. The defaults are
  `Ctrl + Shift + A` (drawing mode) and `Ctrl + Shift + \` (hide bar). Other
  Wayland compositors (KDE, etc.) are not wired up yet.
- **No cursor-relative features.** Actions that depend on the global cursor
  position (such as summon-to-cursor) are unavailable, because Wayland does not
  expose the global pointer position to applications.
- **Drawing canvas is created on demand.** The drawing overlay is created when
  you enter drawing mode and torn down when you leave it. Completed strokes are
  preserved across this, but in rare cases a stroke that is still in progress
  (pointer not yet released) when you leave drawing mode can be dropped. To
  avoid this, finish the stroke (release the pointer) before toggling drawing
  mode off.
- **Multi-monitor.** The control bar lives on the active screen and cannot be
  dragged across screens.

---

## Getting the full experience on Linux

For the complete floating-ball UX, use an **Xorg** session. On GNOME:

1. Log out.
2. On the login (GDM) screen, click your user name.
3. Click the gear/settings icon in the bottom corner.
4. Choose **GNOME on Xorg** (or "Ubuntu on Xorg").
5. Log in.

OpenPen detects the session automatically at startup — no configuration needed.

---

## Why these limits exist

Wayland compositors intentionally restrict what client applications can do, and
several of those restrictions affect a transparent, always-on-top overlay:

- Applications cannot position their own top-level windows, so OpenPen cannot
  place a floating ball or move the bar to follow it.
- A transparent window cannot reliably be made fully click-through, so the bar's
  footprint stays interactive.
- The global cursor position and global keyboard shortcuts are not exposed to
  applications the way they are on X11, so cursor-relative actions and generic
  global shortcuts are unavailable (GNOME's own key-binding mechanism is used
  instead).

X11/Xorg does not impose these restrictions, which is why the experience there
matches macOS and Windows.

---

## Reporting

If OpenPen does not behave as described above on your Linux setup, please open a
GitHub issue and include:

1. The output of `echo "$XDG_SESSION_TYPE"`.
2. Your desktop environment and version (e.g. GNOME 46).
3. Your distribution and version.
4. Whether you are running on real hardware or a virtual machine.
</content>
</invoke>
