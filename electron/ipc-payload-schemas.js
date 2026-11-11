/**
 * Schemas for data that renderers send to the main process over IPC.
 *
 * One export per receiving channel (or per shared payload shape). Each schema
 * accepts exactly what the host renderer and the plugin SDK send today and
 * rejects wrong types and out-of-range values. Object schemas strip unknown
 * keys unless the payload is a relay whose extra fields belong to the
 * receiving renderer (tool config, stroke style, drawing snapshot).
 *
 * This file deliberately has no Electron or channel imports so it can be
 * loaded by unit tests on its own.
 */

import { z } from 'zod';

// ── Shared limits ────────────────────────────────────────────────────────────

/** Largest absolute screen coordinate accepted (virtual desktops stay far below). */
const MAX_SCREEN_COORD = 100_000;
/** Ids: module ids, shortcut ids, plugin ids, diagnostics event ids. */
const MAX_ID_LENGTH = 256;
/** Filesystem paths and URLs. */
const MAX_PATH_LENGTH = 4096;
/** Electron accelerator strings. Empty is allowed: a module may ship a shortcut with no default key. */
const MAX_ACCELERATOR_LENGTH = 128;
/** Renderer error messages and stacks forwarded to the log. */
const MAX_LOG_TEXT_LENGTH = 64 * 1024;

const id = z.string().min(1).max(MAX_ID_LENGTH);
const coord = z.number().min(-MAX_SCREEN_COORD).max(MAX_SCREEN_COORD);
const screenPoint = z.object({ x: coord, y: coord });
const plainObject = z.record(z.string(), z.unknown());
/** Any JS number, including NaN and ±Infinity (zod's `z.number()` rejects those). */
const anyNumber = z.custom((value) => typeof value === 'number', { message: 'expected number' });

// ── Window / overlay / cross-window relay ───────────────────────────────────

export const windowPositionSchema = screenPoint;

export const booleanSchema = z.boolean();

/** Active tool config relayed to the overlay. `tool` is required; extra fields belong to the tool. */
export const toolConfigSchema = z.looseObject({ tool: id });

/** Stroke colour: a CSS colour string or a gradient object. */
const strokeColor = z.union([
  z.string().min(1).max(MAX_ID_LENGTH),
  z.looseObject({ type: z.string().max(MAX_ID_LENGTH) }),
]);

export const strokeStyleSchema = z.looseObject({
  color: strokeColor,
  lineWidth: z.number().positive().max(1000),
});

export const historyStateSchema = z.object({
  canUndo: z.boolean(),
  canRedo: z.boolean(),
});

/** Drawing snapshot (Linux): opaque to main, replayed back to the same overlay. */
export const drawingSnapshotSchema = z.looseObject({});

// ── Settings ─────────────────────────────────────────────────────────────────

const notificationPosition = z.enum([
  'top-left', 'top-center', 'top-right',
  'middle-left', 'center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]);

/**
 * Value schema per user-settings key. Keys mirror `DEFAULT_SETTINGS`.
 */
const settingsValueSchemas = {
  theme: z.enum(['light', 'dark', 'system']),
  language: z.enum(['en', 'zh-Hans', 'zh-Hant', 'ja']),
  enableDragAutoSnap: z.boolean(),
  barLayout: z.enum(['horizontal', 'vertical']),
  autoCollapseDelay: z.number().int().min(0).max(60_000),
  ballOpacity: z.number().min(0).max(1),
  defaultColor: z.string().min(1).max(MAX_ID_LENGTH),
  reducedMotion: z.boolean(),
  notifyOnDrawingMode: z.boolean(),
  notificationPosition,
  confirmBeforeClearCanvas: z.boolean(),
  autoCheckUpdate: z.boolean(),
  disabledModules: z.array(id),
  pluginIdConflictResolutions: z.record(id, z.string().max(MAX_PATH_LENGTH)),
};

/**
 * Settings patch, validated key by key. The settings panel always sends its
 * whole draft, which echoes back every stored value; one out-of-range value
 * read from an older or hand-edited config file must not discard the user's
 * valid edits. So each known key is checked on its own: valid values go into
 * `patch`, invalid ones are listed in `droppedKeys` for the caller to log.
 * Unknown keys (for example the derived `effectiveTheme`) are ignored, as the
 * store always did. A payload that is not a plain object fails outright.
 */
export const settingsPatchSchema = plainObject.transform((payload) => {
  /** @type {Record<string, unknown>} */
  const patch = {};
  /** @type {string[]} */
  const droppedKeys = [];
  for (const [key, schema] of Object.entries(settingsValueSchemas)) {
    if (!Object.hasOwn(payload, key) || payload[key] === undefined) continue;
    const result = schema.safeParse(payload[key]);
    if (result.success) patch[key] = result.data;
    else droppedKeys.push(key);
  }
  return { patch, droppedKeys };
});

export const pluginConflictResolutionsSchema = z.record(id, z.string().max(MAX_PATH_LENGTH));

// ── Layout ───────────────────────────────────────────────────────────────────

/** Shape is checked further by the store's own layout validator. */
export const layoutSchema = plainObject;

export const knownIdsSchema = z.array(z.string().max(MAX_ID_LENGTH));

// ── Module settings / module main handlers ──────────────────────────────────

export const moduleIdSchema = id;

/**
 * The module API types `settingsSchema` as any zod type and `settingsVersion`
 * as any number, so a non-object settings value and a non-integer version are
 * legitimate. They are handled as the store always did: a non-object value is
 * stored as `{}`, and a finite numeric version is kept as given.
 */
export const moduleSettingsSetSchema = z.object({
  moduleId: id,
  settings: z.unknown().transform((value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? /** @type {Record<string, unknown>} */ (value)
      : {}),
  schemaVersion: z.number().optional(),
});

/** `payload` is defined by the plugin's own main handler, so it is not constrained here. */
export const moduleCallSchema = z.object({
  moduleId: id,
  action: z.string().max(MAX_ID_LENGTH),
  payload: z.unknown(),
});

// ── Shortcuts ────────────────────────────────────────────────────────────────

const accelerator = z.string().max(MAX_ACCELERATOR_LENGTH);

export const shortcutSetSchema = z.object({ id, accelerator });

export const shortcutIdSchema = z.object({ id });

export const moduleShortcutRegisterSchema = z.object({ id, keys: accelerator });

// ── Plugin marketplace ───────────────────────────────────────────────────────

export const pluginIdPayloadSchema = z.object({ id });

export const pluginSourcePathSchema = z.object({
  sourcePath: z.string().min(1).max(MAX_PATH_LENGTH),
});

export const pluginRepoUrlSchema = z.object({
  repoUrl: z.string().min(1).max(MAX_PATH_LENGTH),
});

export const pluginReportSchema = z.object({
  id,
  version: z.string().max(MAX_ID_LENGTH).nullish(),
});

export const policyLocaleSchema = z.object({
  locale: z.string().max(32).nullish(),
});

// ── Positioning engine ───────────────────────────────────────────────────────

const snapEdge = z.enum(['top', 'right', 'bottom', 'left']).nullable();
const barLayoutClass = z.enum(['horizontal', 'vbar-left', 'vbar-right', 'vbar-free']);
const barBounds = z.object({
  leftFromBall: coord,
  rightFromBall: coord,
  topFromBall: coord,
  bottomFromBall: coord,
});

export const positioningIntentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('init'),
    persistedSnapEdge: snapEdge.optional(),
    persistedBallScreenPos: screenPoint.optional(),
  }),
  z.object({ type: z.literal('drag-start') }),
  z.object({ type: z.literal('drag-move'), ballScreenPos: screenPoint }),
  z.object({
    type: z.literal('drag-end'),
    ballScreenPos: screenPoint,
    hadMotion: z.boolean(),
    enableDragAutoSnap: z.boolean(),
    barBounds: barBounds.nullish(),
    barLayoutClass: barLayoutClass.nullish(),
  }),
  z.object({ type: z.literal('summon-to-cursor') }),
  z.object({
    type: z.literal('bar-expand'),
    barBounds: barBounds.nullish(),
    barLayoutClass: barLayoutClass.nullish(),
  }),
  z.object({ type: z.literal('bar-collapse') }),
  z.object({ type: z.literal('display-changed') }),
]);

// ── Diagnostics / audit / update / log ──────────────────────────────────────

/** Event ids are generated strings; numbers are accepted too because the stored event list is not validated on load. */
export const diagnosticsEventIdSchema = z.union([id, z.number()]);

export const backupPathSchema = z.string().min(1).max(MAX_PATH_LENGTH);

/**
 * Users call this from DevTools as documented, so any numeric `limit` / `since`
 * is passed through to the ring buffer, which already handles out-of-range values.
 */
export const auditQuerySchema = z.object({
  limit: anyNumber.optional(),
  since: anyNumber.optional(),
  pluginId: z.string().max(MAX_ID_LENGTH).nullable().optional(),
}).optional();

export const rendererErrorSchema = z.object({
  level: z.enum(['error', 'warn']).optional(),
  message: z.string().max(MAX_LOG_TEXT_LENGTH),
  stack: z.string().max(MAX_LOG_TEXT_LENGTH).nullish(),
  source: z.string().max(MAX_PATH_LENGTH).nullish(),
  line: z.number().int().min(0).nullish(),
  column: z.number().int().min(0).nullish(),
});
