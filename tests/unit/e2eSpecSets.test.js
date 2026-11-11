import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { CI_STABLE, PROD_SMOKE, WAYLAND_ONLY } from '../e2e/spec-sets.js';

const E2E_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../e2e');
const stripGlob = (pattern) => pattern.replace(/^\*\*\//, '');

describe('CI_STABLE e2e gate list', () => {
  it('names only spec files that exist, so a rename cannot silently shrink the gate', () => {
    expect(CI_STABLE.length).toBeGreaterThan(0);
    const missing = CI_STABLE.filter((spec) => !fs.existsSync(path.join(E2E_DIR, spec)));
    expect(missing).toEqual([]);
  });

  it('excludes Wayland-only, dev-only and prod-smoke specs (the gate runs functional specs on X11)', () => {
    const excluded = [...WAYLAND_ONLY, PROD_SMOKE].map(stripGlob);
    const offending = CI_STABLE.filter(
      (spec) =>
        spec.startsWith('dev-only/') ||
        excluded.some((suffix) => spec === suffix || spec.endsWith(`/${suffix}`))
    );
    expect(offending).toEqual([]);
  });
});
