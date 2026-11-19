/**
 * Built-in MCP tools. Pure logic: every side effect goes through the injected
 * `host`, so the whole module is unit-testable without Electron.
 *
 * Coordinates of every drawing tool are PIXELS OF THE SCREENSHOT of the target
 * display (what `openpen__screenshot` returns), origin top-left. Arguments are
 * validated here, before anything is sent to an overlay, so a bad call leaves
 * the canvas untouched and the error says what to do next.
 */

import { z } from 'zod';
import { MCP_TOOL_PREFIX } from '../../shared/mcp-constants.js';

const P = MCP_TOOL_PREFIX;

export const BUILTIN_TOOL_NAMES = Object.freeze([
  'get_guide', 'get_state', 'set_drawing_mode', 'set_tool',
  'draw_freehand', 'draw_line', 'draw_rect', 'draw_ellipse', 'draw_highlighter',
  'list_annotations', 'delete_annotation', 'clear_canvas', 'undo', 'redo', 'screenshot',
].map((n) => P + n));

export const READ_ONLY_TOOL_NAMES = Object.freeze(
  ['get_guide', 'get_state', 'list_annotations', 'screenshot'].map((n) => P + n),
);

export const SERVER_INSTRUCTIONS =
  `Before you start, call ${P}get_guide. ` +
  'OpenPen is a screen-annotation overlay: you can look at the screen with ' +
  `${P}screenshot and draw on it. The guide explains the coordinate system and every tool.`;

/** Built-in drawing tool ids, used when the host does not report its own list. */
export const BUILTIN_DRAWING_TOOL_IDS = Object.freeze(['freehand', 'line', 'shape', 'highlighter-pen', 'eraser', 'stroke-eraser']);

const DEFAULT_COLOR = '#818CF8';
const DEFAULT_LINE_WIDTH = 4;
const DEFAULT_HIGHLIGHTER_LINE_WIDTH = 16;

const NAMED_COLORS = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen transparent').split(' '));

/** Hex, rgb()/rgba()/hsl()/hsla() or a CSS colour name. */
function isValidColor(c) {
  if (typeof c !== 'string') return false;
  const v = c.trim().toLowerCase();
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v)) return true;
  if (/^(rgb|hsl)a?([ds.,%/-]+)$/.test(v)) return true;
  return NAMED_COLORS.has(v);
}

const GUIDE_TEXT = `OpenPen usage guide

OpenPen draws annotations on top of the user's screen. Workflow:
1. Call ${P}screenshot to see a display. Every drawing coordinate is a PIXEL of that screenshot (origin top-left, x to the right, y downwards).
2. Draw with one of the draw tools. Drawing switches OpenPen into drawing mode automatically if it is off.
3. Use ${P}list_annotations to see what is on the canvas, then ${P}delete_annotation, ${P}undo, ${P}redo or ${P}clear_canvas to change it.

Draw tools take optional color (hex like "#FF0000", rgb()/hsl() or a CSS colour name; default ${DEFAULT_COLOR}) and lineWidth (> 0, in screenshot pixels; default ${DEFAULT_LINE_WIDTH}, highlighter ${DEFAULT_HIGHLIGHTER_LINE_WIDTH}).

Every tool that takes a display accepts an optional displayId (from ${P}get_state). Without it the display under the mouse cursor is used.

Tools
- ${P}get_guide: this text.
- ${P}get_state: drawing mode, active tool, the tool ids set_tool accepts and the displays (id, pixel size, which one holds the cursor).
- ${P}set_drawing_mode {enabled}: turn drawing mode on or off.
- ${P}set_tool {tool}: select the active tool by id; the control bar follows. Valid ids: ${BUILTIN_DRAWING_TOOL_IDS.join(', ')} (get_state lists the ids available right now; tools added by plugins appear there only while they are the active tool). Drawing tools below do not need set_tool.
- ${P}draw_freehand {points:[{x,y},...], color?, lineWidth?, displayId?}: a free line through the points.
- ${P}draw_line {x1,y1,x2,y2, color?, lineWidth?, displayId?}: a straight line.
- ${P}draw_rect {x,y,width,height, color?, lineWidth?, displayId?}: a rectangle outline.
- ${P}draw_ellipse {x,y,width,height, color?, lineWidth?, displayId?}: an ellipse inside that box.
- ${P}draw_highlighter {points:[{x,y},...], color?, lineWidth?, displayId?}: a translucent highlighter stroke.
- ${P}list_annotations {displayId?}: annotations on the display, each with id, kind and bounds in screenshot pixels.
- ${P}delete_annotation {id, displayId?}: remove one annotation by id.
- ${P}clear_canvas {displayId?}: remove every annotation on the display.
- ${P}undo / ${P}redo {displayId?}: same as the user's undo / redo.
- ${P}screenshot {displayId?}: PNG of the display including the annotations already drawn.

If a call fails the canvas is unchanged; the error text says what to do next.`;

const text = (t) => ({ content: [{ type: 'text', text: t }] });
const fail = (t) => ({ content: [{ type: 'text', text: t }], isError: true });
const json = (value) => text(JSON.stringify(value, null, 2));

const displayId = z.number().int().optional().describe('Display id from get_state; defaults to the display under the cursor.');
const style = {
  color: z.string().optional().describe(`CSS colour: hex ("#ff0000"), rgb()/hsl() or a colour name. Default ${DEFAULT_COLOR}.`),
  lineWidth: z.number().optional().describe(`Line width in screenshot pixels, greater than 0. Default ${DEFAULT_LINE_WIDTH} (highlighter ${DEFAULT_HIGHLIGHTER_LINE_WIDTH}).`),
  displayId,
};
const point = z.object({ x: z.number(), y: z.number() });

// Argument fields are all optional in the schema on purpose: the handlers
// validate and answer with a message that names the valid range and the next
// step, which the protocol-level "invalid params" error cannot do.
const SCHEMAS = {
  get_guide: z.object({}),
  get_state: z.object({}),
  set_drawing_mode: z.object({ enabled: z.boolean().optional() }),
  set_tool: z.object({ tool: z.string().optional() }),
  draw_freehand: z.object({ points: z.array(point).optional(), ...style }),
  draw_highlighter: z.object({ points: z.array(point).optional(), ...style }),
  draw_line: z.object({
    x1: z.number().optional(), y1: z.number().optional(), x2: z.number().optional(), y2: z.number().optional(), ...style,
  }),
  draw_rect: z.object({
    x: z.number().optional(), y: z.number().optional(), width: z.number().optional(), height: z.number().optional(), ...style,
  }),
  draw_ellipse: z.object({
    x: z.number().optional(), y: z.number().optional(), width: z.number().optional(), height: z.number().optional(), ...style,
  }),
  list_annotations: z.object({ displayId }),
  delete_annotation: z.object({ id: z.string().optional(), displayId }),
  clear_canvas: z.object({ displayId }),
  undo: z.object({ displayId }),
  redo: z.object({ displayId }),
  screenshot: z.object({ displayId }),
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * @param {{
 *   getState: () => { drawingMode: boolean, tool: string, displays: Array<{ id: number, pixelWidth: number, pixelHeight: number, scaleFactor: number, isCursorDisplay: boolean }> },
 *   setDrawingMode: (enabled: boolean) => void,
 *   setTool: (id: string) => void,
 *   runOnOverlay: (displayId: number | undefined, command: object) => Promise<any>,
 *   screenshot: (displayId: number | undefined) => Promise<{ data: string, mimeType: string, width: number, height: number, displayId: number }>,
 * }} host
 */
export function createBuiltinTools(host) {
  /** Pick the target display or explain how to pick one. */
  function resolveDisplay(requested) {
    const { displays } = host.getState();
    if (!displays || displays.length === 0) {
      return { error: `No display is available. Try again in a moment, or call ${P}get_state to check.` };
    }
    if (requested === undefined || requested === null) {
      return { display: displays.find((d) => d.isCursorDisplay) ?? displays[0] };
    }
    const found = displays.find((d) => d.id === requested);
    if (!found) {
      const ids = displays.map((d) => d.id).join(', ');
      return { error: `Unknown displayId ${requested}. Available display ids: ${ids}. Call ${P}get_state to see them.` };
    }
    return { display: found };
  }

  const rangeHelp = (d) =>
    `Display ${d.id} is ${d.pixelWidth}x${d.pixelHeight} px. Coordinates are pixels of the ${P}screenshot image of that display ` +
    `and must be within the range x 0-${d.pixelWidth}, y 0-${d.pixelHeight}. ` +
    `Call ${P}screenshot to see the display and read positions off it, then retry.`;

  const invalid = (name, problem, d) => fail(`${P}${name}: ${problem} ${rangeHelp(d)}`);
  const inRange = (d, x, y) => isNum(x) && isNum(y) && x >= 0 && y >= 0 && x <= d.pixelWidth && y <= d.pixelHeight;

  function commonStyle(args) {
    const out = {};
    if (args.color !== undefined) out.color = args.color.trim();
    if (args.lineWidth !== undefined) out.lineWidth = args.lineWidth;
    return out;
  }

  /** Returns an error message for a bad color / lineWidth, else null. */
  function styleProblem(name, args) {
    if (args.color !== undefined && !isValidColor(args.color)) {
      return `${P}${name}: color "${args.color}" is not a valid CSS colour. Use hex like "#FF0000", rgb(255,0,0) or a name like "red", or omit color to use ${DEFAULT_COLOR}.`;
    }
    if (args.lineWidth !== undefined && !(isNum(args.lineWidth) && args.lineWidth > 0)) {
      return `${P}${name}: lineWidth must be a number greater than 0 (screenshot pixels), or omit it to use the default.`;
    }
    return null;
  }

  async function dispatch(display, command) {
    try {
      return { result: await host.runOnOverlay(display.id, command) };
    } catch (err) {
      return { failure: fail(`The overlay could not run the command: ${err?.message ?? err}. The canvas is unchanged. Call ${P}get_state, then retry.`) };
    }
  }

  /** Draw tools switch into drawing mode first so the stroke is visible (AC-8). */
  async function drawOn(name, args, display, command) {
    const bad = styleProblem(name, args);
    if (bad) return fail(bad);
    if (!host.getState().drawingMode) host.setDrawingMode(true);
    const { result, failure } = await dispatch(display, { type: 'draw', ...command, ...commonStyle(args) });
    if (failure) return failure;
    return json({ id: result?.id, displayId: display.id });
  }

  function strokeTool(name, shape) {
    return async (args) => {
      const r = resolveDisplay(args.displayId);
      if (r.error) return fail(r.error);
      const d = r.display;
      const pts = args.points;
      if (!Array.isArray(pts) || pts.length < 2) {
        return invalid(name, 'points must be an array of at least 2 {x, y} items.', d);
      }
      if (!pts.every((p) => p && inRange(d, p.x, p.y))) {
        return invalid(name, 'a point is missing or outside the display.', d);
      }
      return drawOn(name, args, d, { shape, points: pts.map((p) => ({ x: p.x, y: p.y })) });
    };
  }

  function boxTool(name, shape) {
    return async (args) => {
      const r = resolveDisplay(args.displayId);
      if (r.error) return fail(r.error);
      const d = r.display;
      const { x, y, width, height } = args;
      if (![x, y, width, height].every(isNum)) {
        return invalid(name, 'x, y, width and height are all required numbers.', d);
      }
      if (width <= 0 || height <= 0) {
        return invalid(name, 'width and height must be greater than 0.', d);
      }
      if (!inRange(d, x, y) || !inRange(d, x + width, y + height)) {
        return invalid(name, 'the shape extends outside the display.', d);
      }
      return drawOn(name, args, d, { shape, x, y, width, height });
    };
  }

  async function lineTool(args) {
    const r = resolveDisplay(args.displayId);
    if (r.error) return fail(r.error);
    const d = r.display;
    const { x1, y1, x2, y2 } = args;
    if (![x1, y1, x2, y2].every(isNum)) {
      return invalid('draw_line', 'x1, y1, x2 and y2 are all required numbers.', d);
    }
    if (!inRange(d, x1, y1) || !inRange(d, x2, y2)) {
      return invalid('draw_line', 'an end point is outside the display.', d);
    }
    return drawOn('draw_line', args, d, { shape: 'line', from: { x: x1, y: y1 }, to: { x: x2, y: y2 } });
  }

  /** Commands that only need a display. */
  function simpleCommand(type, summarize) {
    return async (args) => {
      const r = resolveDisplay(args.displayId);
      if (r.error) return fail(r.error);
      const { result, failure } = await dispatch(r.display, { type });
      if (failure) return failure;
      return summarize(result, r.display);
    };
  }

  const defs = [
    ['get_guide', 'Usage guide for every OpenPen tool and the coordinate system. Call this first.', true,
      async () => text(GUIDE_TEXT)],
    ['get_state', 'Current drawing mode, active tool and the displays (id, pixel size, cursor display).', true,
      async () => json(host.getState())],
    ['set_drawing_mode', 'Turn OpenPen drawing mode on or off.', false, async ({ enabled }) => {
      if (typeof enabled !== 'boolean') return fail(`${P}set_drawing_mode needs "enabled": true or false.`);
      host.setDrawingMode(enabled);
      return json({ drawingMode: enabled });
    }],
    ['set_tool', 'Select the active drawing tool by id (ids are listed by get_state and get_guide).', false, async ({ tool }) => {
      if (typeof tool !== 'string' || !tool) return fail(`${P}set_tool needs a "tool" id such as "freehand". Call ${P}get_state to see the current tool.`);
      const known = host.getState().tools ?? BUILTIN_DRAWING_TOOL_IDS;
      if (!known.includes(tool)) {
        return fail(`Unknown tool "${tool}". Valid tool ids: ${known.join(', ')}. Call ${P}set_tool again with one of them; nothing was changed.`);
      }
      host.setTool(tool);
      return json({ tool });
    }],
    ['draw_freehand', 'Draw a free line through the given points. Coordinates are screenshot pixels.', false, strokeTool('draw_freehand', 'freehand')],
    ['draw_line', 'Draw a straight line. Coordinates are screenshot pixels.', false, lineTool],
    ['draw_rect', 'Draw a rectangle outline. Coordinates are screenshot pixels.', false, boxTool('draw_rect', 'rect')],
    ['draw_ellipse', 'Draw an ellipse inside the given box. Coordinates are screenshot pixels.', false, boxTool('draw_ellipse', 'ellipse')],
    ['draw_highlighter', 'Draw a translucent highlighter stroke through the points. Coordinates are screenshot pixels.', false, strokeTool('draw_highlighter', 'highlighter')],
    ['list_annotations', 'List the annotations on a display with id, kind and bounds in screenshot pixels.', true,
      simpleCommand('list', (result, d) => json({ displayId: d.id, annotations: result?.annotations ?? [] }))],
    ['delete_annotation', 'Delete one annotation by id (ids come from list_annotations).', false, async ({ id, displayId: did }) => {
      if (typeof id !== 'string' || !id) return fail(`${P}delete_annotation needs the annotation "id". Call ${P}list_annotations to get ids.`);
      const r = resolveDisplay(did);
      if (r.error) return fail(r.error);
      const { result, failure } = await dispatch(r.display, { type: 'delete', id });
      if (failure) return failure;
      if (!result?.deleted) return fail(`No annotation with id "${id}" on display ${r.display.id}. Call ${P}list_annotations to see the current ids.`);
      return json({ deleted: true, id });
    }],
    ['clear_canvas', 'Remove every annotation on a display.', false,
      simpleCommand('clear', (_r, d) => json({ cleared: true, displayId: d.id }))],
    ['undo', 'Undo the last canvas change, like the user pressing undo.', false,
      simpleCommand('undo', (_r, d) => json({ undone: true, displayId: d.id }))],
    ['redo', 'Redo the last undone change.', false,
      simpleCommand('redo', (_r, d) => json({ redone: true, displayId: d.id }))],
    ['screenshot', 'PNG screenshot of a display, annotations included. Drawing coordinates are pixels of this image.', true, async ({ displayId: did }) => {
      const r = resolveDisplay(did);
      if (r.error) return fail(r.error);
      try {
        const shot = await host.screenshot(r.display.id);
        return {
          content: [
            { type: 'image', data: shot.data, mimeType: shot.mimeType },
            { type: 'text', text: JSON.stringify({ displayId: shot.displayId, width: shot.width, height: shot.height }) },
          ],
        };
      } catch (err) {
        return fail(`Screenshot failed: ${err?.message ?? err}. On macOS, grant OpenPen Screen Recording permission, then retry.`);
      }
    }],
  ];

  return defs.map(([name, description, readOnly, handler]) => ({
    name: P + name,
    description,
    inputSchema: SCHEMAS[name],
    readOnly,
    handler,
  }));
}

/**
 * Pick the tools a client may see. Built-in tools are always eligible; a tool
 * that carries a `pluginId` is dropped unless every plugin is exposed or its id
 * is listed. Read-only mode keeps only tools that cannot change the canvas.
 *
 * @param {Array<{ name: string, readOnly?: boolean, pluginId?: string }>} tools
 * @param {{ readOnly?: boolean, exposeAll?: boolean, enabledPlugins?: string[] }} config
 */
export function filterTools(tools, config = {}) {
  const { readOnly = false, exposeAll = true, enabledPlugins = [] } = config;
  return tools.filter((t) => {
    if (readOnly && !t.readOnly) return false;
    if (t.pluginId && !exposeAll && !enabledPlugins.includes(t.pluginId)) return false;
    return true;
  });
}
