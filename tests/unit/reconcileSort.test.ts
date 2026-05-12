/**
 * Unit tests for src/components/control-bar-reconcile.ts
 *
 * Cases:
 * 1. Two plugins same defaultGroup, different installedAt → earlier one first.
 * 2. Two plugins same installedAt → id alpha tie-break.
 * 3. Plugin missing installedAt → sorts after plugins with installedAt;
 *    among missing, id alpha.
 * 4. Built-in always sorts before plugin within the same auto-created group.
 * 5. User-positioned items are never reordered (only auto-appended items sorted).
 */

import { describe, it, expect } from 'vitest';
import { reconcileLayoutGroups, type LayoutGroupShape } from '../../src/components/control-bar-reconcile';
import type { ControlBarContribution } from '@openpen/module-api';

// Minimal shim — component prop is not exercised by reconcile.
const NOOP_COMPONENT = {} as import('vue').Component;

function makeContrib(id: string, defaultGroup: string): ControlBarContribution {
  return { id, component: NOOP_COMPONENT, defaultGroup };
}

const BASE_LAYOUT = { version: 1 as const, groups: [{ id: 'default', items: [] }] };

// ── 1. Different installedAt → earlier plugin first ───────────────────────────

describe('plugin sort by installedAt', () => {
  it('places the earlier installedAt plugin first', () => {
    const contributions = [
      makeContrib('plugin-b', 'shared'),
      makeContrib('plugin-a', 'shared'),
    ];
    const installedAtMap = new Map<string, string | null>([
      ['plugin-a', '2024-06-01T00:00:00.000Z'],
      ['plugin-b', '2024-01-01T00:00:00.000Z'], // earlier
    ]);
    const result = reconcileLayoutGroups(BASE_LAYOUT, contributions, new Map(), installedAtMap);
    const sharedGroup = result.groups.find((g) => g.id === 'shared')!;
    expect(sharedGroup.items).toEqual(['plugin-b', 'plugin-a']);
  });
});

// ── 2. Same installedAt → id alpha tie-break ──────────────────────────────────

describe('plugin tie-break by id alpha', () => {
  it('sorts alphabetically when installedAt timestamps are identical', () => {
    const ts = '2024-05-01T10:00:00.000Z';
    const contributions = [
      makeContrib('zebra-plugin', 'tools'),
      makeContrib('alpha-plugin', 'tools'),
      makeContrib('middle-plugin', 'tools'),
    ];
    const installedAtMap = new Map<string, string | null>([
      ['zebra-plugin', ts],
      ['alpha-plugin', ts],
      ['middle-plugin', ts],
    ]);
    const result = reconcileLayoutGroups(BASE_LAYOUT, contributions, new Map(), installedAtMap);
    const group = result.groups.find((g) => g.id === 'tools')!;
    expect(group.items).toEqual(['alpha-plugin', 'middle-plugin', 'zebra-plugin']);
  });
});

// ── 3. Missing installedAt → sorts after those with it; among missing, id alpha ─

describe('plugins with missing installedAt', () => {
  it('sorts plugin with installedAt before plugins without', () => {
    const contributions = [
      makeContrib('no-ts-b', 'misc'),
      makeContrib('has-ts',  'misc'),
      makeContrib('no-ts-a', 'misc'),
    ];
    const installedAtMap = new Map<string, string | null>([
      ['has-ts',  '2024-03-01T00:00:00.000Z'],
      ['no-ts-a', null],
      ['no-ts-b', null],
    ]);
    const result = reconcileLayoutGroups(BASE_LAYOUT, contributions, new Map(), installedAtMap);
    const group = result.groups.find((g) => g.id === 'misc')!;
    // has-ts first, then no-ts-a < no-ts-b alphabetically.
    expect(group.items).toEqual(['has-ts', 'no-ts-a', 'no-ts-b']);
  });
});

// ── 4. Built-in always before plugin in the same group ────────────────────────

describe('built-in vs plugin ordering', () => {
  it('places built-in items before plugin items regardless of installedAt order', () => {
    const contributions = [
      makeContrib('ext-plugin', 'tools'),
      makeContrib('@openpen/freehand',   'tools'),   // built-in
      makeContrib('another-plugin', 'tools'),
      makeContrib('@openpen/line',       'tools'),   // built-in
    ];
    const builtInOrder = new Map<string, number>([
      ['@openpen/freehand', 0],
      ['@openpen/line', 1],
    ]);
    const installedAtMap = new Map<string, string | null>([
      ['ext-plugin',     '2020-01-01T00:00:00.000Z'], // very old → but still after built-ins
      ['another-plugin', '2021-01-01T00:00:00.000Z'],
    ]);
    const result = reconcileLayoutGroups(BASE_LAYOUT, contributions, builtInOrder, installedAtMap);
    const group = result.groups.find((g) => g.id === 'tools')!;
    // @openpen/freehand(0) → @openpen/line(1) → ext-plugin(2020) → another-plugin(2021)
    expect(group.items).toEqual(['@openpen/freehand', '@openpen/line', 'ext-plugin', 'another-plugin']);
  });
});

// ── 5. User-positioned items are never reordered ──────────────────────────────

describe('user-positioned items', () => {
  it('leaves already-placed items in place; only newly-appended items are sorted', () => {
    const layoutWithExisting: { version: 1; groups: LayoutGroupShape[] } = {
      version: 1,
      groups: [
        {
          id: 'tools',
          items: ['@openpen/freehand', '@openpen/line'], // already placed by user
        },
        { id: 'default', items: [] },
      ],
    };
    const contributions = [
      makeContrib('@openpen/freehand',    'tools'), // already placed → skip
      makeContrib('@openpen/line',        'tools'), // already placed → skip
      makeContrib('late-plugin', 'tools'), // new
    ];
    const installedAtMap = new Map<string, string | null>([
      ['late-plugin', '2024-11-01T00:00:00.000Z'],
    ]);
    const result = reconcileLayoutGroups(layoutWithExisting, contributions, new Map(), installedAtMap);
    const group = result.groups.find((g) => g.id === 'tools')!;
    // @openpen/freehand / @openpen/line stay at front (user-positioned), late-plugin appended.
    expect(group.items).toEqual(['@openpen/freehand', '@openpen/line', 'late-plugin']);
  });

  it('returns the identical layout object when nothing needs to be added', () => {
    const layoutWithAll: { version: 1; groups: LayoutGroupShape[] } = {
      version: 1,
      groups: [
        { id: 'tools', items: ['@openpen/freehand'] },
        { id: 'default', items: [] },
      ],
    };
    const contributions = [makeContrib('@openpen/freehand', 'tools')];
    const result = reconcileLayoutGroups(
      layoutWithAll, contributions, new Map(), new Map()
    );
    // Identity check — must be the exact same object when not mutated.
    expect(result).toBe(layoutWithAll);
  });
});
