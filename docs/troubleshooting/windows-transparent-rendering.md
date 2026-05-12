# Windows: Transparent overlay shows black background

## Symptom

When running OpenPen on Windows, the drawing overlay window (or the floating control bar)
appears with a **solid black background** instead of being transparent.  The overlay covers
the entire screen and makes the desktop and other applications invisible behind it.

In less severe cases you may see black flickering around the ball or bar edges, or the
overlay turns black only when another window is brought to the foreground.

OpenPen detects this condition at startup and shows a warning banner if it is found.

---

## Cause

This is a known Electron platform bug
([Electron issue #40515](https://github.com/electron/electron/issues/40515)) that affects
certain combinations of GPU hardware and graphics driver.

Windows requires the GPU compositor to support per-pixel alpha blending for transparent
`layered windows`.  Some GPU drivers — particularly older Intel integrated GPU drivers and
some AMD display drivers on Windows 10 — report compositor support but produce incorrect
output: instead of blending the transparent region with the desktop, they fill it with
solid black (`RGBA 0,0,0,255`).

The bug is at the driver level; Electron and OpenPen have no reliable in-process fix.

---

## Affected configurations

The failure is GPU/driver-specific and not fully enumerated.  Reported patterns include:

- Intel integrated graphics (UHD 620, UHD 630, Iris Xe) with driver versions older than
  approximately 27.20.x / 2021.
- Some AMD Radeon RX 500 series drivers on Windows 10 (20H2 and older).
- Virtual machines and remote-desktop sessions that use a software renderer with no
  hardware compositor (VMware, VirtualBox, RDP with basic display adapter).

Systems with a discrete NVIDIA GPU and up-to-date drivers are generally not affected.

---

## Workarounds

Work through the options in order.  The first one that resolves the black background is
the right fix for your system.

### 1. Update your graphics driver (recommended first step)

Download the latest driver directly from the GPU vendor — not through Windows Update,
which often lags months behind:

- **Intel**: https://www.intel.com/content/www/us/en/download-center/home.html
- **AMD**: https://www.amd.com/en/support/download/drivers.html
- **NVIDIA**: https://www.nvidia.com/download/index.aspx

After updating, reboot and relaunch OpenPen.

### 2. Force OpenPen to use the other GPU (laptop users)

If your laptop has both an integrated GPU and a discrete GPU (e.g., Intel iGPU + NVIDIA
dGPU), Windows may be running OpenPen on the iGPU.  Try forcing it to the discrete GPU:

1. Open **Windows Settings → System → Display → Graphics** (Windows 11) or
   **Control Panel → NVIDIA Control Panel → Manage 3D settings** (Windows 10).
2. Add `OpenPen.exe` to the app list.
3. Set the GPU preference to **High performance** (discrete GPU).
4. Relaunch OpenPen.

### 3. Run in compatibility mode

Right-click `OpenPen.exe` → **Properties → Compatibility**:

- Check **"Disable fullscreen optimizations"**.
- Check **"Run this program as an administrator"** (only if you are comfortable with this
  and the other steps have not helped).

Relaunch OpenPen after each change.

---

## Why OpenPen does not auto-fix this

Disabling hardware acceleration (`--disable-gpu` flag) would prevent the black-background
bug.  However, OpenPen is a real-time drawing application: hardware acceleration is
essential for smooth freehand strokes, pressure simulation, and canvas compositing.
Disabling it causes severe frame-rate drops and makes the app impractical for its primary
use case.

Rather than silently degrade the drawing experience for all users to work around a
driver bug that affects a minority, OpenPen detects the condition and notifies you so you
can target the root cause (the driver) directly.

---

## Reporting

If none of the workarounds help, please open a GitHub issue and include:

1. Your GPU model and driver version (found in **Device Manager → Display Adapters →
   right-click your GPU → Properties → Driver tab**).
2. Your Windows version (run `winver` from the Start menu).
3. The output of the DirectX Diagnostic Tool: press `Win + R`, type `dxdiag`, and click
   the **Display** tab. Click **Save All Information…** and attach the resulting
   `DxDiag.txt` to the issue (it contains GPU driver and feature-level details that
   pinpoint the bug to a specific driver version).

This information helps identify new driver combinations and track progress on the upstream
Electron fix.

**Electron upstream issue:** https://github.com/electron/electron/issues/40515
