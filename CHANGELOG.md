# Changelog

## [1.0.0](https://github.com/openpen-platform/openpen/compare/v0.9.0...v1.0.0) (2026-05-13)

### 🎉 Initial Open Source Release

OpenPen is now open source. Draw on your screen without leaving your app.

### Features

* **Transparent drawing overlay** — sits above any window, including full-screen apps,
  without alt-tabbing or losing focus
* **Drawing tools** — freehand pen, straight line, rectangle, and ellipse
* **Stroke controls** — adjustable width and color; gradient highlight mode
* **Floating ball** — collapses to a draggable ball that snaps to the screen edge
  when released; stays out of the way when you don't need it
* **Plugin-first architecture** — built-in drawing tools are themselves plugins;
  third-party plugins use the same `OpenPenModule` contract and slot system as
  the built-ins, with no privileged core
* **Plugin SDK** — `@openpen/module-api` for plugin development,
  `@openpen/build` for build tooling, `openpen-cli` for plugin management

### Platform Support

| Platform | Artifacts | Status |
|---|---|---|
| macOS | `.dmg` (arm64 + x64) | ✅ Supported |
| Windows | `.exe` (x64 + arm64) | ✅ Supported |
| Linux | AppImage (x64 + arm64) | ⚠️ Overlay layering breaks in draw mode — fix in progress |
