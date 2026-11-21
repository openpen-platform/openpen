# Changelog

## [1.8.0](https://github.com/openpen-platform/openpen/compare/v1.7.0...v1.8.0) (2026-11-21)


### Features

* **drawing:** hold a key to draw without entering drawing mode ([de31a87](https://github.com/openpen-platform/openpen/commit/de31a87c80035e372c08271c01b73ca56b586818))
* **drawing:** persist shape and eraser panel choices across restarts ([5ca2b04](https://github.com/openpen-platform/openpen/commit/5ca2b0439553ca2fa08d46b08c5e4b194ace43b0))
* **settings:** let users change the MCP port ([01bcdb2](https://github.com/openpen-platform/openpen/commit/01bcdb2a827838f541969fe42ba5156a3908b580))
* **settings:** match Chinese descriptions in marketplace search ([1f6ba08](https://github.com/openpen-platform/openpen/commit/1f6ba086d4ebaf70a9e9bfcb5f02ada3b2288a40))


### Bug Fixes

* **mcp:** count the screenshot guard per MCP session and refuse over-limit batches ([e727a12](https://github.com/openpen-platform/openpen/commit/e727a12d29e91eed151817208f3a1384c2967008))
* **mcp:** scale MCP stroke widths by the display scale ([9c05f38](https://github.com/openpen-platform/openpen/commit/9c05f38e40ab0bd0153805e1c5b6be45f0c968e8))
* **overlay:** report the physical display size at 125% and 150% scaling ([cc99b14](https://github.com/openpen-platform/openpen/commit/cc99b14b7690cf26f37aabdf2f56aba4d99cd9b0))
* **tests:** judge log isolation against the real log directory ([0527910](https://github.com/openpen-platform/openpen/commit/0527910ef53a5faec1a34fddd8cd333c13c3490e))

## [1.7.0](https://github.com/openpen-platform/openpen/compare/v1.6.0...v1.7.0) (2026-11-21)


### Features

* bundle the text and arrow plugins with the installer ([#152](https://github.com/openpen-platform/openpen/issues/152)) ([2ecb39e](https://github.com/openpen-platform/openpen/commit/2ecb39e01a1faa67505812ad7a1a4a5b92f4b80a))
* **canvas:** render smooth, tapered and soft brush strokes and filled regions ([eb47eef](https://github.com/openpen-platform/openpen/commit/eb47eef1714c9efa92ef201316804ce37ce519a2))
* **cli:** scaffold a demo MCP tool and check tools when packing ([c56349c](https://github.com/openpen-platform/openpen/commit/c56349c9f00bc89b34efb845e2797d4c7fe0d1ea))
* **drawing:** keep strokes on screen after leaving drawing mode ([707c3f2](https://github.com/openpen-platform/openpen/commit/707c3f25a004ef7724a5e476f0bfe95a3e8f25a3))
* install OpenPen into Claude Desktop from the MCP settings ([d5bf35f](https://github.com/openpen-platform/openpen/commit/d5bf35f6843c1b5e6cbba59be834f4f5a941497c))
* list and run plugin MCP tools from the local endpoint ([c5806f2](https://github.com/openpen-platform/openpen/commit/c5806f273c3cb71a954b417826827ac9a601ba50))
* **mcp:** add paint and fill tools, zoomed screenshots and a painting guide ([84661f1](https://github.com/openpen-platform/openpen/commit/84661f1375ec8c17e5e3deacb8384a8da32c1acd))
* **module-api:** let plugin MCP tools convert screenshot points to canvas ([569a316](https://github.com/openpen-platform/openpen/commit/569a316f54e57d56028ae7b430cd9e45be08fb7b))
* **module-api:** let plugins declare MCP tools ([b236a31](https://github.com/openpen-platform/openpen/commit/b236a31cadb102869a8763cef8b0453188b379f8))
* **plugin:** show icons, screenshots and Chinese text in the marketplace ([b7d730b](https://github.com/openpen-platform/openpen/commit/b7d730b7eab696047fdf77c7646ce33d1f280390))
* serve a local MCP endpoint so AI apps can draw on screen ([bc0ec4c](https://github.com/openpen-platform/openpen/commit/bc0ec4c95715ec27a6ba9145fb507f47278d3cfa))
* **settings:** add an MCP tab ([9419feb](https://github.com/openpen-platform/openpen/commit/9419febb65b8609b1d21690523f98f995ca2c980))
* **settings:** show why plugin tools are not exposed ([8dadab1](https://github.com/openpen-platform/openpen/commit/8dadab1a1b8adf155e65144bc7d8ebea14f7cf47))


### Bug Fixes

* accept the colour notations the MCP guide lists and document tool limits ([2289d6d](https://github.com/openpen-platform/openpen/commit/2289d6d7a1f3808e418029c8a93ef39bdfb8c75b))
* **app:** exit on system quit requests instead of waiting on a dialog ([625346a](https://github.com/openpen-platform/openpen/commit/625346ab4647fc4e846c4fdeb799cdd4c53a722e))
* **build:** make the pnpm install and build work ([8f64edb](https://github.com/openpen-platform/openpen/commit/8f64edb9bc8b8ba5da064562b6dd9afcb40aed48))
* **canvas:** keep background layers intact under the brush eraser ([9fbe369](https://github.com/openpen-platform/openpen/commit/9fbe369701fa3c1bf118af0e85c882ce74913c21))
* **cli:** align plugin publishing docs and scaffold with actual behavior ([3a8364e](https://github.com/openpen-platform/openpen/commit/3a8364e5925d21a04efa4821b072ae248f464f4f))
* **cli:** derive starter button and tool ids from the plugin name ([eb2aebd](https://github.com/openpen-platform/openpen/commit/eb2aebd17d27ee1ca0d14b7f8d158750122951c3))
* **cli:** scaffold ignores zips and guides a new project; catalog bot only comments ([9287fbb](https://github.com/openpen-platform/openpen/commit/9287fbbc4c4dbfd0d784764259adf3d61c1a2ded))
* **cli:** stop publish crashing while reading the owner info ([9acf8f6](https://github.com/openpen-platform/openpen/commit/9acf8f6b53673824a00c848f0e9623551bd5ccea))
* **drawing:** keep strokes drawn before the tools register ([c983bf4](https://github.com/openpen-platform/openpen/commit/c983bf492d767e57b3d2a7d2aeeda254df1fa7c9))
* **drawing:** let a focused text editor receive single-key hotkeys ([#153](https://github.com/openpen-platform/openpen/issues/153)) ([6980a7d](https://github.com/openpen-platform/openpen/commit/6980a7dd57400942d239ee68878623093e8d032b))
* **mcp:** do not wait for a repaint while the overlay is hidden ([389da20](https://github.com/openpen-platform/openpen/commit/389da20fc16b1843085d821130d3179d03bec049))
* **mcp:** reply to draw and edit commands once the overlay has repainted ([8b7e29f](https://github.com/openpen-platform/openpen/commit/8b7e29f3618b8e301fdad4e3663ae36a36ed3b13))
* **mcp:** show agent strokes added mid-stroke and cap ping at one wait ([e95f490](https://github.com/openpen-platform/openpen/commit/e95f49094e58e84122ab61e697c3e3eed8b22e16))
* **plugin:** compare minAppVersion against the openpen version ([b230fd1](https://github.com/openpen-platform/openpen/commit/b230fd1485cbcc836f615766c0858bc71cb79dc5))
* **plugin:** write plugin tool info logs to the OpenPen log ([c7dee80](https://github.com/openpen-platform/openpen/commit/c7dee8036d1f5421eed0f5be1eebf5342e3a0709))
* point draw_rect docs to the fill tool for large areas ([e1ac34e](https://github.com/openpen-platform/openpen/commit/e1ac34ef77c5c08c66d0370d2a03245b3f6bf988))
* show plugin tool drawings when drawing mode is off ([824dd29](https://github.com/openpen-platform/openpen/commit/824dd29e5524a70021abe134a6e8739ea23c7b7b))
* **tests:** grade eval answers from a final answer line ([fbefbff](https://github.com/openpen-platform/openpen/commit/fbefbffcef92d9270ec683a4c3a17664f8e70cb2))
* **tests:** stabilise settings cancel, HUD, watchdog and recovery specs ([6af4487](https://github.com/openpen-platform/openpen/commit/6af4487830bd2250f219498bf02bacc11a16980b))


### Performance Improvements

* **canvas:** draw only new strokes and repaint after GPU context restore ([2fc8e3b](https://github.com/openpen-platform/openpen/commit/2fc8e3b01c559c0c8668476f9a2a57cb8a3e92c0))

## [1.6.0](https://github.com/openpen-platform/openpen/compare/v1.5.0...v1.6.0) (2026-11-14)


### Features

* **cli:** type-check Vue templates in the plugin check command ([#142](https://github.com/openpen-platform/openpen/issues/142)) ([cbb8f15](https://github.com/openpen-platform/openpen/commit/cbb8f158094172dba0686400d582a88ccb4070a1))
* **control-bar:** fade through when the bar switches orientation ([aac5f17](https://github.com/openpen-platform/openpen/commit/aac5f17a7577705cf676e2826045a675922d74dc))
* **drawing:** add optional automatic stroke fade-out ([#133](https://github.com/openpen-platform/openpen/issues/133)) ([a2a00f7](https://github.com/openpen-platform/openpen/commit/a2a00f79fc123dc0fdbee923587ee11d187c2a91))
* **drawing:** add screen capture to file or clipboard ([759916d](https://github.com/openpen-platform/openpen/commit/759916da1c8596c0d4aa83cce226c8df3fc014f6))
* **drawing:** add semi-transparent highlighter tool ([#123](https://github.com/openpen-platform/openpen/issues/123)) ([68b7e50](https://github.com/openpen-platform/openpen/commit/68b7e50e0d15df482f3d153610177efb49317728))
* **drawing:** add single-key tool and color shortcuts in drawing mode ([7bf9470](https://github.com/openpen-platform/openpen/commit/7bf947021a8183616d8796a158bf9b25fc167b07))
* **module-api:** add activateTool and Wayland plugin shortcuts ([#130](https://github.com/openpen-platform/openpen/issues/130)) ([90e3a98](https://github.com/openpen-platform/openpen/commit/90e3a980f704a1c08a5f6453ded3e3ebb25e451c))
* **module-api:** upgrade zod to 4 ([c25ffab](https://github.com/openpen-platform/openpen/commit/c25ffab8ade237df24e60b5c22f4c61559935a1b))
* **overlay:** recover windows whose renderer crashed, hung or failed to load ([#132](https://github.com/openpen-platform/openpen/issues/132)) ([f28d0e9](https://github.com/openpen-platform/openpen/commit/f28d0e945dae0d46692911564b2fa02bf7dff494))
* **plugin:** add opt-in community plugin listing to the marketplace ([e65765e](https://github.com/openpen-platform/openpen/commit/e65765ed4970243c928e54afeebb52d0aee41906))
* **plugin:** add report entry and policy link to the marketplace ([#118](https://github.com/openpen-platform/openpen/issues/118)) ([224b3b8](https://github.com/openpen-platform/openpen/commit/224b3b8d2e5ce98d4112f311d742c139db6f7348))
* **settings:** add top-level config version and stepwise migration ([#137](https://github.com/openpen-platform/openpen/issues/137)) ([296886f](https://github.com/openpen-platform/openpen/commit/296886f8975063dff3f473dd9ff6169d72e97682))
* **uikit:** add AppPopoverPanel and AppPopoverRow for plugin popover content ([5879b2c](https://github.com/openpen-platform/openpen/commit/5879b2ccf993dd81ef527fdf4fa46b0768bd2f63))
* **uikit:** add AppSwatchPicker and AppToggleButton ([d6c4bf8](https://github.com/openpen-platform/openpen/commit/d6c4bf8a7ffefeb4c2d39aeb3a52084819b03a4e))
* **uikit:** align popover rows, add slider bubble, restyle segmented ([98c1b6f](https://github.com/openpen-platform/openpen/commit/98c1b6f0f75e140da31386ef87f376240da28611))


### Bug Fixes

* **boot:** drop duplicate log import in positioning engine ([#147](https://github.com/openpen-platform/openpen/issues/147)) ([ac3263c](https://github.com/openpen-platform/openpen/commit/ac3263cc3aac1678a8eda0cf964beb419565e25d))
* **boot:** handle uncaught exceptions in one place and cap log files ([#135](https://github.com/openpen-platform/openpen/issues/135)) ([f046cba](https://github.com/openpen-platform/openpen/commit/f046cba35146b282397ee18bee9d6364b109e4c2))
* **cli:** point new plugin authors at the local install flow ([77bdf3d](https://github.com/openpen-platform/openpen/commit/77bdf3d35c0e980ef94bb9eda49f8003bd5562a5))
* **cli:** ship license and gitignore with scaffolded plugin projects ([#128](https://github.com/openpen-platform/openpen/issues/128)) ([94f4f7d](https://github.com/openpen-platform/openpen/commit/94f4f7d8691d24d3aad6a43a968d06bbe05a126d))
* **cli:** teach one command name and describe the plugin catalog ([c860428](https://github.com/openpen-platform/openpen/commit/c860428bc67ec45820140276bb8b273f1b6d910b))
* **control-bar:** make the side-edge snap landing visible ([#146](https://github.com/openpen-platform/openpen/issues/146)) ([a84b709](https://github.com/openpen-platform/openpen/commit/a84b7094a0c62dcf8b7a8fff3c66fd24b4aaad09))
* **notifications:** draw the drawing-mode toast above the control bar ([9b45433](https://github.com/openpen-platform/openpen/commit/9b45433778ca4ce6a3ccb6f51e5f21187a328306))
* **overlay:** keep windows on screen when macOS reveals the desktop ([ad44dd0](https://github.com/openpen-platform/openpen/commit/ad44dd04b87ab6ecca52c62e660176169f0ce243))
* **plugin:** remove empty scope directory after uninstalling a plugin ([624e75b](https://github.com/openpen-platform/openpen/commit/624e75bb310a1a38f0dcfbfab5923f89dfdfb087))
* **positioning:** fall back to the primary display when none are reported ([#136](https://github.com/openpen-platform/openpen/issues/136)) ([e682307](https://github.com/openpen-platform/openpen/commit/e682307362567599f4dd1a223ac269e9c4a7c91e))
* **positioning:** keep intent queue alive after a failed intent ([#138](https://github.com/openpen-platform/openpen/issues/138)) ([772ab07](https://github.com/openpen-platform/openpen/commit/772ab075f8fb706ce4a9bcd39b25d8bcafe620c0))
* **settings:** close only the topmost plugin dialog on Escape ([#150](https://github.com/openpen-platform/openpen/issues/150)) ([6124421](https://github.com/openpen-platform/openpen/commit/6124421336e3a3fcb8217e75bb34ea031b448e58))
* **settings:** close plugin detail on Escape and open repo link externally ([#134](https://github.com/openpen-platform/openpen/issues/134)) ([1b1adc6](https://github.com/openpen-platform/openpen/commit/1b1adc6488a58a61ede137729daba30d3e2dc63f))
* **settings:** flag and rebind built-in shortcuts that fail to register ([f4dcfa2](https://github.com/openpen-platform/openpen/commit/f4dcfa20081ea7393cb32357a61d983b12384ed6))
* **settings:** route settings store errors and warnings to the file log ([#149](https://github.com/openpen-platform/openpen/issues/149)) ([115e52d](https://github.com/openpen-platform/openpen/commit/115e52deca7db916859215243994f1c33367c777))
* **settings:** show a focus ring on the language select and accent chips ([c2ea03d](https://github.com/openpen-platform/openpen/commit/c2ea03dacb90467a268f0dae8c43be116e90dbb0))
* **settings:** show the in-use notice when a shortcut reset fails ([70b4ef3](https://github.com/openpen-platform/openpen/commit/70b4ef375e6e8fe6bb063d41246ddba288e0b07b))
* **settings:** trap and restore focus in plugin dialogs ([b570ccf](https://github.com/openpen-platform/openpen/commit/b570ccf77f3b2d9a47a54edaea5f017144d97739))
* **tests:** isolate marketplace e2e installs in a sandbox HOME ([e9d14b4](https://github.com/openpen-platform/openpen/commit/e9d14b4e4746d72c21634c6c4721c2655f12e4ef))
* **tests:** remove per-run temp directories after the e2e suite ([#127](https://github.com/openpen-platform/openpen/issues/127)) ([43564c2](https://github.com/openpen-platform/openpen/commit/43564c2a2a5e0647a22822ab83a929173e48b4da))
* **tests:** sandbox HOME for every e2e launch ([0bcb5d1](https://github.com/openpen-platform/openpen/commit/0bcb5d177d1410d51184c17a2bd1ebde3e8128bc))
* **uikit:** name slider thumb and select trigger, drop aria-pressed from toggle ([#126](https://github.com/openpen-platform/openpen/issues/126)) ([f08705e](https://github.com/openpen-platform/openpen/commit/f08705eb788ae3ac3f7d4320f6b2758ff247a766))
* validate renderer IPC payloads in the main process ([#120](https://github.com/openpen-platform/openpen/issues/120)) ([79e768e](https://github.com/openpen-platform/openpen/commit/79e768e6c52301f8c9f5e59a0d833f0144b92a0e))

## [1.5.0](https://github.com/openpen-platform/openpen/compare/v1.4.3...v1.5.0) (2026-06-12)


### Features

* **In-app auto-update via GitHub Releases** ([469f062](https://github.com/openpen-platform/openpen/commit/469f062c4d5a1db8eba21988684681c448456545))
  * OpenPen now checks GitHub Releases for new versions on launch (toggle in Settings → Behavior) and on demand from Settings → About.
  * Windows (installer) and Linux (AppImage) download updates in the background with a live progress bar and apply them on "Restart & install"; Windows uses blockmap delta downloads so updates only fetch what changed.
  * macOS surfaces new versions with a direct link to the download page — in-place install requires a code-signed build and will activate in a future release once signing is in place.
  * The About tab presents update activity as a callout banner with a per-version "Later" dismissal, localized in English, 日本語, 简体中文, and 繁體中文.
  * Windows portable builds hide the update controls entirely (a portable .exe has no installer to apply an update).

## [1.4.3](https://github.com/openpen-platform/openpen/compare/v1.4.2...v1.4.3) (2026-06-11)


### Bug Fixes

* show the OS cursor over the control bar while drawing; wire plugin restart buttons ([467e395](https://github.com/openpen-platform/openpen/commit/467e395d1391e92d377896fb50c808f72bd8307e))

## [1.4.2](https://github.com/openpen-platform/openpen/compare/v1.4.1...v1.4.2) (2026-06-11)


### Bug Fixes

* **build:** restore macOS ad-hoc signing by pinning electron-builder to ~26.8.1 ([ecbcca1](https://github.com/openpen-platform/openpen/commit/ecbcca135e74d877dcc373d9e552880f56985767))

## [1.4.1](https://github.com/openpen-platform/openpen/compare/v1.4.0...v1.4.1) (2026-06-11)


### Bug Fixes

* **plugins:** serve openpen-plugin scheme with CORS so renderer imports work on Electron 42 ([cd156f0](https://github.com/openpen-platform/openpen/commit/cd156f0cfbf240196c8f6f0f4e6ce320ef83b482))

## [1.4.0](https://github.com/openpen-platform/openpen/compare/v1.3.0...v1.4.0) (2026-06-11)


### Features

* **module-api:** add commitStroke host API for async-placement tools ([c8b1807](https://github.com/openpen-platform/openpen/commit/c8b18072ffff8ecaa14d70e237c069b55b218035))
* **settings:** add ControlBar Layout tab ([e1d6d12](https://github.com/openpen-platform/openpen/commit/e1d6d12a62edffa7db2c44bbb5e14baf1905f3af))


### Bug Fixes

* **positioning:** animate the control bar after a display-topology change ([1a7e1a3](https://github.com/openpen-platform/openpen/commit/1a7e1a3caefbe5d08a94a2898fbb6bdd24dda465))
* reconcile control-bar visibility across all displays ([7ccb63e](https://github.com/openpen-platform/openpen/commit/7ccb63eaf60a2add10a8ee5c9d690cbc329f534d))

## [1.3.0](https://github.com/openpen-platform/openpen/compare/openpen@v1.2.0...openpen@v1.3.0) (2026-05-31)


### Features

* **linux:** always-shown Wayland bar + cross-platform hide-bar shortcut ([a6cb6e7](https://github.com/openpen-platform/openpen/commit/a6cb6e730a8688da6e3e2536d5dd88d2c6794b7e))

## [1.2.0](https://github.com/openpen-platform/openpen/compare/v1.1.1...v1.2.0) (2026-05-24)


### Features

* **module-api:** add resolveStrokeColor helper for StrokeColor union ([75e9a9c](https://github.com/openpen-platform/openpen/commit/75e9a9c74d002393134931f9bc933b918c9d0391))
* **module-api:** ship dist + host services via registry injection ([ccae34f](https://github.com/openpen-platform/openpen/commit/ccae34f3030d9d5973336eb4882d4969d5f1b343))
* **openpen-cli:** add security prompt before plugin install ([d9342ae](https://github.com/openpen-platform/openpen/commit/d9342ae12810859c42a8378aaa54686355c05db6))
* **uikit:** add AppButtonDropdown and migrate built-in modules onto SDK button components ([5aeb7d3](https://github.com/openpen-platform/openpen/commit/5aeb7d34f58d5291546cfeca15cf7f3ee8c9b4ba))


### Bug Fixes

* **boot:** gate App.vue content-ready signal for settings window ([3be53aa](https://github.com/openpen-platform/openpen/commit/3be53aa2341170ec56bb8db02a572a81dfe08687))
* **boot:** signal renderer content ready before module bootstrap ([0551f2a](https://github.com/openpen-platform/openpen/commit/0551f2a5124039c867fbdef06e0213920862f987))
* **cli:** substitute package.json name in scaffold ([b28742f](https://github.com/openpen-platform/openpen/commit/b28742f73d796f872aa95e167701c73c78f257db))
* **dev:** prevent overlay lockout from Vite port collision and renderer hang ([753057f](https://github.com/openpen-platform/openpen/commit/753057fb8d8420e771f4f65c17519956fd673786))
* **e2e:** restore green baseline across all scopes ([7576694](https://github.com/openpen-platform/openpen/commit/757669456db6554798409e5c4d572b7f0c251ea1))
* **main:** wrap whenReady init chain in single try-catch ([53a9b0b](https://github.com/openpen-platform/openpen/commit/53a9b0b62734671c04d0cb86d1929a9b78b35cef))
* **plugin-meta:** align MODULE_ID_RE with scoped format ([ad78aa7](https://github.com/openpen-platform/openpen/commit/ad78aa75ea3cc303aa93705dd022df0670e3807a))

## [1.1.1](https://github.com/openpen-platform/openpen/compare/v1.1.0...v1.1.1) (2026-05-19)


### Bug Fixes

* **release-please:** correct per-package CHANGELOG path nesting ([d151e9d](https://github.com/openpen-platform/openpen/commit/d151e9def2fa82234b1c24a1d7f83f06988c0e36))
* **runtime:** substitute import.meta.env.* in plugin runtime shims ([6c50e01](https://github.com/openpen-platform/openpen/commit/6c50e01cbcd3016ee62e2146f4fb572c3afab4b0))

## [1.1.0](https://github.com/openpen-platform/openpen/compare/v1.0.2...v1.1.0) (2026-05-19)

Cursor presentation overhaul and a richer plugin install flow, plus a batch of control-bar and canvas reliability fixes.

### Features

- **cursors**: New DOM-overlay cursor system. The drawing cursor is rendered by the renderer process as a positioned DOM element rather than the OS cursor, so per-tool visuals (colour, size, shape, hover-on-interactive feedback) stay in sync with the active drawing tool and brush size, even when the OS cursor would otherwise be hidden by passthrough or full-screen apps. The plugin SDK reference also gained the missing `ui.cursors` slot documentation and several previously undocumented UIKit primitives. ([2f77192](https://github.com/openpen-platform/openpen/commit/2f771927fb94586b0ceef58e07fcb5220ed40c02))
- **plugin-install**: The Add Custom dialog can now accept `.zip` archive sources in addition to the previous catalog / direct-url entries. The dialog UX itself was reworked — clearer source-type selection, validation feedback, and inline progress while the catalog or archive is being fetched. ([1098fd9](https://github.com/openpen-platform/openpen/commit/1098fd97ab74eafcb6692144c1b9c6aa949c3508))

### Bug Fixes

- **canvas**: Stroke style (brush colour / width / opacity) is now seeded from the active module's defaults at boot instead of starting at an uninitialised state. Previously the first stroke after launch could render with stale or zero-value parameters until the user touched the stroke-style picker once. ([1a8f6b0](https://github.com/openpen-platform/openpen/commit/1a8f6b0f3cc36a42be4ecabe307065dcd7189d52))
- **control-bar**: The Settings button is now disabled while drawing mode is active. Opening Settings during a live drawing session previously tore down the overlay window's mouse-passthrough wiring, leaving the cursor stuck in a half-state once the dialog closed. ([2d60f7f](https://github.com/openpen-platform/openpen/commit/2d60f7fb3d3284efb03ac3a0ab8cd6466be4bbce))
- **control-bar**: The auto-collapse timer is paused while any dialog (Settings, plugin install, Add Custom) is open. The bar previously could collapse out from under an open dialog and orphan it. ([#1](https://github.com/openpen-platform/openpen/issues/1)) ([add84ff](https://github.com/openpen-platform/openpen/commit/add84ff89f1ad5135c7371fd7d4bfd64b1ef2395))
- **drawing-mode** (macOS): Repaired sporadic drawing-mode entry when the global shortcut fired while the pointer was off the overlay (over the dock / menu bar / a secondary display). The same-state re-entry path no longer races the cursor wake-up burst, and a stale `pointerleave` no longer leaves the overlay cursor invisible after entry. ([564046d](https://github.com/openpen-platform/openpen/commit/564046d27e2b066411f6df3dde6f3c0bcad48a23))

### For plugin authors and downstream packagers

- **TypeScript 6.0 compatibility**: The repo and all published packages compile cleanly under both TypeScript 5.9 and 6.0. `@openpen/plugin-manager` declares `@types/node` directly (previously inherited transitively via vitest) and its `tsconfig.build.json` pins `rootDir` and `types: ["node"]` explicitly, so the build no longer depends on TypeScript's auto type-acquisition heuristics. The Dependabot TS 6.0.3 bump rides in this release. ([#22](https://github.com/openpen-platform/openpen/pull/22))
- **Dependency hygiene**: A grouped Dependabot batch landed — jsdom 27 → 29, eslint 9 → 10, wait-on 8 → 9, and a production-minor-patch group covering three runtime packages. No behaviour changes expected; flagged here so reproducible-build setups have an accurate manifest. ([#18](https://github.com/openpen-platform/openpen/pull/18) – [#23](https://github.com/openpen-platform/openpen/pull/23))

## [1.0.2](https://github.com/openpen-platform/openpen/compare/v1.0.1...v1.0.2) (2026-05-14)


### Bug Fixes

* **docs:** scrub `npx openpen` typosquat from package READMEs ([6e05267](https://github.com/openpen-platform/openpen/commit/6e05267909b5168cad7a61d38639fca2aa11e96e))
* **plugin-manager:** add README so npm package page is not blank ([080f2c5](https://github.com/openpen-platform/openpen/commit/080f2c5656e031bd70da852545194c34ca8e702f))

## [1.0.1](https://github.com/openpen-platform/openpen/compare/v1.0.0...v1.0.1) (2026-05-14)

Hotfix release. Unblocks third-party plugin author onboarding that was broken in v1.0.0, and ships `@openpen/plugin-manager` to npm for the first time alongside its sibling SDK packages.

### Bug Fixes

- **docs**: `npx openpen <verb>` invocations throughout the docs resolved to an unrelated package on npm (the bare `openpen` name is occupied by a fuzzing tool by another author). All commands now read `npx openpen-cli <verb>`.
- **docs**: The `plugin-starter` scaffold command in the README pointed at a non-existent GitHub repo. Updated to use the in-repo starter via degit subpath syntax: `npx degit openpen-platform/openpen/packages/plugin-starter`.
- **ci**: The npm publish step was guarded by a single-package existence check; if any one workspace was already on npm, the whole publish job short-circuited and silently skipped the rest. This is why `@openpen/plugin-manager` never reached the registry alongside the other v1.0.0 packages. Replaced with a per-workspace publish loop that inspects each `packages/*` independently, skips private packages and already-published versions, and never aborts the others on a single failure.

### Packages on npm

`@openpen/plugin-manager@1.0.0` ships to npm for the first time in this release, making `npm install openpen-cli` work for external developers. The other workspaces (`@openpen/module-api`, `@openpen/build`, `openpen-cli`) remain at their v1.0.0 versions on npm (no code changes to those packages in v1.0.1).

### Note

If you tried to develop an OpenPen plugin while v1.0.0 was the latest release and hit `npx openpen` invocation errors or `npm install openpen-cli` 404s, please retry now — the v1.0.1 hotfix removes both blockers.

## [1.0.0](https://github.com/openpen-platform/openpen/compare/v0.9.0...v1.0.0) (2026-05-13)

First public release. Establishes the OpenPen module / plugin architecture, the initial UIKit wrapper set, and the end-to-end plugin lifecycle.

### Platforms

| Platform | Artifacts | Status |
|---|---|---|
| macOS | `.dmg` (arm64 + x64) | ✅ Supported |
| Windows | `.exe` (x64) | ✅ Supported |
| Linux | — | ⚠️ Not in v1.0.0 — overlay layering issue, will ship in a follow-up release |

### Added

#### Versioning
- All four OpenPen packages — the host app, `@openpen/module-api`, `@openpen/build`, and `openpen-cli` — release at `1.0.0` and ship in lockstep.
- `OpenPenModule` accepts an optional `minAppVersion` field; the plugin loader skips any plugin whose declared minimum exceeds the running host version and surfaces a warning in the log.

See [docs/concepts/plugin-compatibility.md](docs/concepts/plugin-compatibility.md) for the compatibility model, version matrix, and next major policy.

#### Diagnostics
- File-based crash and error logger (`electron-log`) writes to OS-standard log paths so users can attach `main.log` to bug reports. Captures Vue errors, renderer crashes, uncaught exceptions, and unhandled promise rejections.

#### Core app
- Cross-platform Electron + Vue 3 transparent overlay for on-screen drawing during screen sharing.
- Per-display snap geometry with edge-aware vertical bar (`snap-left`, `snap-right`).
- Idle ball-fade + auto-collapse with popover-aware suspension so open modules never get dropped from under the cursor.
- User-customisable built-in shortcuts: a Settings → Shortcuts tab lets the user rebind `toggleDrawingMode`, `undo`, and `redo` at runtime. Bindings persist to `config.json#userShortcuts`, broadcast via `SHORTCUTS.UPDATED`, and re-register through a try-new-first path so a failed registration leaves the existing binding intact.

#### Module / plugin architecture
- Four-layer plugin-host architecture: core / host chrome / UIKit / built-in modules + plugins. Built-in modules and third-party plugins share the same `OpenPenModule` contract.
- Contribution slot registry (`canvas.tools`, `ui.control-bar`, `ui.modals`, `ui.cursors`, `system.shortcuts`, `system.locales`).
- `@openpen/module-api` SDK with `defineModule()`, contribution types, and Zod-backed runtime validation at module boundaries.
- `ctx.notify()` and host notification service: modules call `ctx.notify(payload)` in `setup()` or shortcut handlers to show ephemeral toast feedback in the overlay window. `NotifyPayload` supports i18n `LocaleMap`, `variant` (default / success / warning / danger), and `duration` (ms, 0 = sticky). Returns `NotifyHandle` with `dismiss()` for early dismissal. Position controlled by the user's `notificationPosition` setting (9 tokens).
- `@openpen/module-api/uikit` wrappers (8 components): `AppPopover`, `AppDialog`, `AppSlider`, `AppToggle`, `AppSegmented`, `AppSelect`, `AppTooltip`, `AppTabs`. Each ships with a contract test pinning props / events / slots so the underlying headless library (Reka UI ~2.9.6) can be swapped without breaking plugin code.
- Per-group `inset` config on the control-bar layout. Enabling inset guarantees zero increase to bar height (inner items shrink to 30 px).
- One-shot layout migration: legacy configs with `eraser` inside the `tools` group are auto-repaired to the design-canonical shape on boot.

#### Plugin SDK + tooling
- `@openpen/build` CLI: zero-config Vite preset for plugin authors. Inlines plugin scoped CSS into `dist/renderer.js` via `vite-plugin-css-injected-by-js@~4.0.1` so single-file shipment "just works".
- `openpen-cli` (`npx openpen`): `plugin add` (local path / npm / GitHub source with auto-build), `plugin list`, `plugin remove`. Installs only `plugin.json + dist/` — never `src/`, `node_modules/`, or `.git/`. Removal is a clean `fs.rmSync` — host L3b repair sweeps any leftover layout entries on next boot.
- ESM importmap-based runtime sharing: host emits stable `dist/openpen-runtime/{vue,module-api,module-api-uikit}.js` shims and `index.html` declares an importmap, so plugins import bare `vue` / `@openpen/module-api` and resolve to the **same** Vue instance the host uses (single reactive graph, no duplication, no version drift).
- Vite dev middleware (`/openpen-runtime/*`) using virtual modules + `transformRequest` so plugin loading works under `npm run dev` without importmap cycles or default-export mismatches.
- `packages/plugin-starter`: minimal `degit`-able template demonstrating `defineModule` + `AppPopover` + `AppSlider`, complete with Vue type-shim so `npm run check` is green out of the box.

#### Documentation
- `docs/reference/uikit.md` covers the eight UIKit wrappers; `docs/reference/primitives.md` documents the low-level primitives + tokens.css + escape hatch.
- `docs/concepts/module-architecture.md` describes the three-layer model and module contract.
- `docs/reference/slots.md` lists every contribution slot with the `ControlBarContribution` interface inlined.
- `CONTRIBUTING.md` (root) covers contribution workflow + DCO sign-off policy.

### Security

OpenPen follows a **user-installed trust model**: plugins run in the same renderer as the host with full access to the shared Vue instance and `window.openPenApi`. Users MUST evaluate plugin sources before installing.

### Known limitations
- **Linux artifact not shipped**: AppImage build is gated on an upstream overlay layering issue. Will ship in a follow-up release.
- **Plugin-contributed shortcut customisation** is on the roadmap; v1.0.0 only customises built-in shortcuts.
- Plugin development under `npm run dev` is supported but lightly tested.

### Note

The first GitHub Release pipeline run for v1.0.0 had a misconfiguration on our side. **If you downloaded v1.0.0 before 2026-05-14 13:00 UTC+8 (05:00 UTC), please re-download** — the artifacts attached to this release have since been rebuilt and republished.

Apologies for the inconvenience. This was OpenPen's first end-to-end release through automated CI, and we're learning as we go. Discussion, bug reports, and suggestions on how to improve the release process are all very welcome. Thank you.
