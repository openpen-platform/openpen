// Stroke redraw cost vs. number of strokes on screen.
// Opt-in performance measurement, skipped unless OPENPEN_E2E_PERF=1, so the
// regular functional suite never runs it.
//
// Fills the overlay to each level in OPENPEN_PERF_LEVELS (default 100,1000,2000,5000,10000),
// then adds OPENPEN_PERF_ADDS strokes (default 20) one at a time through the
// MCP bridge (executeMcpCommand draw, which returns once the overlay has
// repainted). Records ms per added stroke, frame rate / longest frame
// and input latency while adding and while idle, and per-process CPU from
// app.getAppMetrics(). Writes JSON to $OPENPEN_PERF_OUT when set.
//
// A second test (OPENPEN_PERF_PROBE=gpu) kills the GPU process and checks that the
// strokes are painted again after the 2D context is restored.
//
//   OPENPEN_E2E_PERF=1 OPENPEN_PERF_OUT=/tmp/perf.json npx playwright test tests/e2e/perf/stroke-redraw-cost.spec.js -g "measure redraw"
//   OPENPEN_E2E_PERF=1 OPENPEN_PERF_PROBE=gpu npx playwright test tests/e2e/perf/stroke-redraw-cost.spec.js -g probe
import { test } from '@playwright/test';
import fs from 'node:fs';
import { launchElectronApp } from '../launch.js';

const TOTAL = Number(process.env.OPENPEN_PERF_TOTAL ?? 10000);
const POINTS = Number(process.env.OPENPEN_PERF_POINTS ?? 20);
const WIGGLE = process.env.OPENPEN_PERF_WIGGLE !== '0';

test.setTimeout(60 * 60 * 1000);

test.skip(process.env.OPENPEN_E2E_PERF !== '1', 'opt-in performance measurement: set OPENPEN_E2E_PERF=1')

test('measure redraw cost vs stroke count', async () => {
  const app = await launchElectronApp();
  const result = { platform: process.platform, total: TOTAL, pointsPerStroke: POINTS, batches: [], redraw: [], idle: [], cpu: [] };
  try {
    await app.firstWindow();
    let overlay = null;
    for (let i = 0; i < 50 && !overlay; i++) {
      overlay = app.windows().find((w) => w.url().includes('window=overlay')) ?? null;
      if (!overlay) await new Promise((r) => setTimeout(r, 200));
    }
    if (!overlay) throw new Error('overlay window not found');
    await overlay.waitForSelector('[data-testid="canvas-overlay"]');
    await overlay.waitForTimeout(1500);

    result.env = await overlay.evaluate(async () => {
      const store = await import('/src/services/stroke-store.ts');
      const bus = await import('/src/core/runtime/event-bus.ts');
      const bridge = await import('/src/services/mcp-tool-bridge.ts').catch(() => null);
      const c = document.querySelector('[data-testid="canvas-overlay"]');
      let seq = 0;
      // Deterministic pseudo-random so runs are comparable across platforms.
      let s = 12345;
      const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      const W = c.clientWidth, H = c.clientHeight;
      window.__perfProbe = {
        store, bus, bridge,
        makeStroke(points) {
          const x0 = rnd() * (W - 200) + 100, y0 = rnd() * (H - 200) + 100;
          const pts = [];
          for (let i = 0; i < points; i++) pts.push({ x: x0 + Math.sin(i / 3) * 40 + i * 4, y: y0 + Math.cos(i / 4) * 30 });
          return { id: `perf-${seq++}`, tool: 'freehand', points: pts, style: { color: '#818cf8', lineWidth: 4, lineCap: 'round', lineJoin: 'round' } };
        },
        // Stand-in for an MCP draw: adds the stroke, records the undo command and
        // requests a redraw both immediately and on the next frame.
        acc: { syncMs: 0, rafMs: 0, rafCount: 0 },
        mcpDraw(points) {
          const stroke = this.makeStroke(points);
          const acc = this.acc;
          const a = performance.now();
          store.addStroke(stroke);
          store.pushCommand({ type: 'ADD_STROKE', stroke });
          bus.emit('canvas-redraw-requested');
          acc.syncMs += performance.now() - a;
          requestAnimationFrame(() => { const b = performance.now(); bus.emit('canvas-redraw-requested'); acc.rafMs += performance.now() - b; acc.rafCount++; });
        },
      };
      // Frame + input probes.
      window.__perfProbe.frames = [];
      window.__perfProbe.lat = [];
      const loop = (t) => { window.__perfProbe.frames.push(t); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      window.addEventListener('pointermove', (e) => window.__perfProbe.lat.push(performance.now() - e.timeStamp), true);
      window.addEventListener('mousemove', (e) => window.__perfProbe.lat.push(performance.now() - e.timeStamp), true);
      return { cssW: W, cssH: H, dpr: devicePixelRatio, backing: [c.width, c.height], strokesAtStart: store.getAllStrokes().length, ua: navigator.userAgent };
    });

    const cpu = async (label) => {
      const m = await app.evaluate(({ app: a }) => a.getAppMetrics().map((p) => ({ type: p.type, pid: p.pid, cpu: p.cpu.percentCPUUsage, name: p.name })));
      result.cpu.push({ label, metrics: m });
    };
    const resetProbes = () => overlay.evaluate(() => { window.__perfProbe.frames = []; window.__perfProbe.lat = []; });
    const frameStats = () => overlay.evaluate(() => {
      const f = window.__perfProbe.frames;
      const d = []; for (let i = 1; i < f.length; i++) d.push(f[i] - f[i - 1]);
      const span = f.length > 1 ? f[f.length - 1] - f[0] : 0;
      const lat = window.__perfProbe.lat.slice().sort((a, b) => a - b);
      const q = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : null);
      return { fps: span ? ((f.length - 1) * 1000) / span : null, maxFrameMs: d.length ? Math.max(...d) : null, p95FrameMs: q(d.slice().sort((a, b) => a - b), 0.95), inputLatP50: q(lat, 0.5), inputLatP95: q(lat, 0.95), inputLatMax: lat.length ? lat[lat.length - 1] : null, inputSamples: lat.length };
    });
    // Moves the pointer through the CDP input pipeline (same queue as real input).
    // Bounded: CDP input waits for a frame, which a hidden window never produces.
    const move = (x, y) => Promise.race([overlay.mouse.move(x, y).catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
    const wiggle = async (ms) => {
      const end = Date.now() + ms; let k = 0;
      while (Date.now() < end) { await move(200 + (k % 50) * 4, 200 + (k % 30) * 3); k++; await new Promise((r) => setTimeout(r, 16)); }
    };
    // Synchronous cost of one 'canvas-redraw-requested'. Originally this was
    // a full repaint; now the repaint runs on the next frame, so this
    // stays near zero and the per-stroke wall time below is the number to read.
    const redrawCost = (n) => overlay.evaluate((count) => {
      const { bus, store } = window.__perfProbe;
      const t = []; for (let i = 0; i < 5; i++) { const a = performance.now(); bus.emit('canvas-redraw-requested'); t.push(performance.now() - a); }
      t.sort((a, b) => a - b);
      return { strokes: store.getAllStrokes().length, medianMs: t[2], minMs: t[0], maxMs: t[4], at: count };
    }, n);
    const idle = async (label) => {
      await overlay.waitForTimeout(500);
      await resetProbes(); await cpu(`${label}:idle-start`);
      await wiggle(3000);
      await cpu(`${label}:idle-end`);
      result.idle.push({ label, ...(await frameStats()) });
    };

    await idle('0');
    result.redraw.push(await redrawCost(0));
    // Level mode: bulk-fill the store to each level (no per-stroke redraw), then
    // add ADDS strokes one at a time through the MCP path and time them.
    const LEVELS = (process.env.OPENPEN_PERF_LEVELS ?? '100,1000,2000,5000,10000').split(',').map(Number).filter((x) => x <= TOTAL);
    const ADDS = Number(process.env.OPENPEN_PERF_ADDS ?? 20);
    for (const level of LEVELS) {
      await overlay.evaluate(({ level, points }) => {
        const { store, bus } = window.__perfProbe;
        while (store.getAllStrokes().length < level - 1) store.addStroke(window.__perfProbe.makeStroke(points));
        bus.emit('canvas-redraw-requested');
      }, { level, points: POINTS });
      await overlay.waitForTimeout(1000);
      result.redraw.push(await redrawCost(level));
      await idle(String(level));
      await resetProbes(); await cpu(`adds-${level}:start`);
      let stop = false;
      const wig = (async () => { let k = 0; while (WIGGLE && !stop) { await move(300 + (k % 40) * 5, 300); k++; await new Promise((r) => setTimeout(r, 50)); } })();
      const r = await overlay.evaluate(async ({ adds, points }) => {
        window.__perfProbe.acc = { syncMs: 0, rafMs: 0, rafCount: 0 };
        const per = [];
        const { bridge } = window.__perfProbe;
        const a = performance.now();
        for (let i = 0; i < adds; i++) {
          const b = performance.now();
          if (bridge) {
            // The real MCP draw command: it returns once the overlay has repainted.
            const pts = window.__perfProbe.makeStroke(points).points.map((p) => ({ x: p.x * devicePixelRatio, y: p.y * devicePixelRatio }));
            await bridge.executeMcpCommand({ type: 'draw', shape: 'freehand', points: pts, color: '#818cf8', lineWidth: 4 * devicePixelRatio });
          } else {
            window.__perfProbe.mcpDraw(points);
            // Wait until the stroke has been through a frame (≈ what the user sees).
            await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
          }
          per.push(performance.now() - b);
        }
        const acc = window.__perfProbe.acc;
        per.sort((x, y) => x - y);
        return { viaBridge: !!bridge, wall: performance.now() - a, medianAddMs: per[Math.floor(per.length / 2)], maxAddMs: per[per.length - 1], ...acc };
      }, { adds: ADDS, points: POINTS });
      stop = true; await wig;
      await cpu(`adds-${level}:end`);
      const visibility = await overlay.evaluate(() => document.visibilityState);
      result.batches.push({ level, adds: ADDS, viaBridge: r.viaBridge, visibility, wallMs: r.wall, perStrokeMs: r.wall / ADDS, medianAddMs: r.medianAddMs, maxAddMs: r.maxAddMs, syncMsPerAdd: r.syncMs / ADDS, rafMsPerAdd: r.rafMs / Math.max(1, r.rafCount), ...(await frameStats()) });
      console.log(`[perf] level ${level}: ${(r.wall / ADDS).toFixed(1)} ms/stroke (median ${r.medianAddMs.toFixed(1)}), sync redraw ${(r.syncMs / ADDS).toFixed(1)} ms, raf redraw ${(r.rafMs / Math.max(1, r.rafCount)).toFixed(1)} ms`);
    }
  } finally {
    const out = process.env.OPENPEN_PERF_OUT;
    if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ redraw: result.redraw, idle: result.idle }, null, 1));
    await app.close();
  }
});

// Probe: does the overlay keep its strokes in the store but lose
// them on screen when the GPU process restarts (2D canvas context loss)?
test('probe: strokes after GPU process restart', async () => {
  test.skip(process.env.OPENPEN_PERF_PROBE !== 'gpu', 'set OPENPEN_PERF_PROBE=gpu');
  const app = await launchElectronApp();
  const out = {};
  try {
    await app.firstWindow();
    let overlay = null;
    for (let i = 0; i < 50 && !overlay; i++) {
      overlay = app.windows().find((w) => w.url().includes('window=overlay')) ?? null;
      if (!overlay) await new Promise((r) => setTimeout(r, 200));
    }
    await overlay.waitForSelector('[data-testid="canvas-overlay"]');
    await overlay.waitForTimeout(1500);
    const sample = () => overlay.evaluate(async () => {
      const store = await import('/src/services/stroke-store.ts');
      const c = document.querySelector('[data-testid="canvas-overlay"]');
      const ctx = c.getContext('2d');
      const px = ctx.getImageData(300 * devicePixelRatio, 300 * devicePixelRatio, 1, 1).data;
      return { strokes: store.getAllStrokes().length, alphaAt300: px[3], events: window.__perfProbeEvents ?? [], isContextLost: typeof ctx.isContextLost === 'function' ? ctx.isContextLost() : null };
    });
    await overlay.evaluate(async () => {
      const store = await import('/src/services/stroke-store.ts');
      const bus = await import('/src/core/runtime/event-bus.ts');
      const c = document.querySelector('[data-testid="canvas-overlay"]');
      window.__perfProbeEvents = [];
      c.addEventListener('contextlost', () => window.__perfProbeEvents.push(['contextlost', performance.now()]));
      c.addEventListener('contextrestored', () => window.__perfProbeEvents.push(['contextrestored', performance.now()]));
      for (let i = 0; i < 49; i++) {
        const s = { id: `p-${i}`, tool: 'freehand', points: [{ x: 100, y: 200 + i * 4 }, { x: 600, y: 200 + i * 4 }], style: { color: '#ff0000', lineWidth: 6, lineCap: 'round', lineJoin: 'round' } };
        store.addStroke(s); store.pushCommand({ type: 'ADD_STROKE', stroke: s });
      }
      bus.emit('canvas-redraw-requested');
    });
    await overlay.waitForTimeout(500);
    out.before = await sample();
    await overlay.screenshot({ path: process.env.OPENPEN_PERF_SHOT_BEFORE ?? test.info().outputPath('gpu-before.png') });
    const gpu = await app.evaluate(({ app: a }) => a.getAppMetrics().filter((p) => p.type === 'GPU').map((p) => p.pid));
    out.gpuPids = gpu;
    for (const pid of gpu) process.kill(pid, 'SIGKILL');
    await overlay.waitForTimeout(4000);
    out.gpuPidsAfter = await app.evaluate(({ app: a }) => a.getAppMetrics().filter((p) => p.type === 'GPU').map((p) => p.pid));
    out.after = await sample();
    await overlay.screenshot({ path: process.env.OPENPEN_PERF_SHOT_AFTER ?? test.info().outputPath('gpu-after.png') });
  } finally {
    console.log('[perf-probe]', JSON.stringify(out));
    if (process.env.OPENPEN_PERF_OUT) fs.writeFileSync(process.env.OPENPEN_PERF_OUT, JSON.stringify(out, null, 2));
    await app.close();
  }
});

// Probe: the brush eraser cuts strokes only, never a background
// layer, both while dragging and after pointer-up.
test('probe: eraser keeps background layer', async () => {
  test.skip(process.env.OPENPEN_PERF_PROBE !== 'eraser', 'set OPENPEN_PERF_PROBE=eraser');
  const app = await launchElectronApp();
  const out = {};
  try {
    const main = await app.firstWindow();
    let overlay = null;
    for (let i = 0; i < 50 && !overlay; i++) {
      overlay = app.windows().find((w) => w.url().includes('window=overlay')) ?? null;
      if (!overlay) await new Promise((r) => setTimeout(r, 200));
    }
    await overlay.waitForSelector('[data-testid="canvas-overlay"]');
    await overlay.waitForTimeout(1500);
    await overlay.evaluate(async () => {
      const slots = await import('/src/core/runtime/contribution-store.ts');
      const store = await import('/src/services/stroke-store.ts');
      const bus = await import('/src/core/runtime/event-bus.ts');
      slots.registerContribution('canvas.layers.background', 'perf-probe', {
        id: 'perf-bg',
        render: (ctx) => { ctx.save(); ctx.fillStyle = 'rgb(0,255,0)'; ctx.fillRect(50, 150, 400, 100); ctx.restore(); },
      });
      const s = { id: 'probe-red', tool: 'freehand', points: [{ x: 80, y: 200 }, { x: 420, y: 200 }], style: { color: 'rgb(255,0,0)', lineWidth: 20, lineCap: 'butt', lineJoin: 'round' } };
      store.addStroke(s); store.pushCommand({ type: 'ADD_STROKE', stroke: s });
      bus.emit('canvas-redraw-requested');
    });
    await main.evaluate(() => { window.openPenApi?.setDrawingMode(true); window.openPenApi?.setActiveTool({ tool: 'eraser' }); });
    await overlay.waitForTimeout(800);
    const px = (x, y) => overlay.evaluate(([x, y]) => {
      const c = document.querySelector('[data-testid="canvas-overlay"]');
      const d = c.getContext('2d').getImageData(x * devicePixelRatio, y * devicePixelRatio, 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    }, [x, y]);
    out.before = { erasedSpot: await px(250, 200), keptStroke: await px(100, 200), bgOnly: await px(250, 170) };
    await overlay.mouse.move(200, 200);
    await overlay.mouse.down();
    for (let x = 200; x <= 300; x += 10) { await overlay.mouse.move(x, 200); await overlay.waitForTimeout(20); }
    await overlay.waitForTimeout(100);
    out.dragging = { erasedSpot: await px(250, 200), keptStroke: await px(100, 200), bgOnly: await px(250, 170) };
    await overlay.mouse.up();
    await overlay.waitForTimeout(300);
    out.afterUp = { erasedSpot: await px(250, 200), keptStroke: await px(100, 200), bgOnly: await px(250, 170) };
    out.activeToolStrokes = await overlay.evaluate(async () => (await import('/src/services/stroke-store.ts')).getAllStrokes().map((s) => s.tool));
    await main.evaluate(() => window.openPenApi?.setDrawingMode(false));
  } finally {
    console.log('[perf-eraser]', JSON.stringify(out));
    if (process.env.OPENPEN_PERF_OUT) fs.writeFileSync(process.env.OPENPEN_PERF_OUT, JSON.stringify(out, null, 2));
    await app.close();
  }
});
