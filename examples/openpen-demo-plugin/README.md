# openpen-demo-plugin

A live example of an OpenPen plugin that adds a translucent
highlighter tool. Useful as a reference when building your own.

## Build & install

```bash
cd examples/openpen-demo-plugin
npm install
npm run build           # outputs dist/renderer.js

# Install locally for testing
mkdir -p ~/.openpen/plugins/openpen-demo-plugin
cp plugin.json -R ~/.openpen/plugins/openpen-demo-plugin/
cp -R dist ~/.openpen/plugins/openpen-demo-plugin/
```

Restart OpenPen → enter drawing mode (`Cmd+Shift+A`) → expand the
control bar → highlighter button (`✏️` style icon at slot 60 of the
left section) appears. Pick it; you'll see translucent yellow strokes
on the canvas.

## What's interesting in here

- `src/index.ts` — single `defineModule` call wiring the tool, toolbar
  button, and cursor into the right slots.
- `src/highlighter-tool.ts` — a full `Tool` implementation with a
  paired `renderStroke` for redraw fidelity.
- `src/HighlighterButton.vue` — Vue component that emits `tool-changed`
  via a `CustomEvent` so it doesn't need to import host internals.
