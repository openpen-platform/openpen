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
  'OpenPen is a screen-annotation overlay: it lets you draw lines, shapes and highlights on top of what the user sees on screen. ' +
  'The usual loop is to take a screenshot, draw, then take another screenshot to check the result. ' +
  'The guide covers the coordinate system, colour formats, the limits and best use of each tool, a worked example and common mistakes.';

/** Built-in drawing tool ids, used when the host does not report its own list. */
export const BUILTIN_DRAWING_TOOL_IDS = Object.freeze(['freehand', 'line', 'shape', 'highlighter-pen', 'eraser', 'stroke-eraser']);

const DEFAULT_COLOR = '#818CF8';
const DEFAULT_LINE_WIDTH = 4;
const DEFAULT_HIGHLIGHTER_LINE_WIDTH = 16;

const NAMED_COLORS = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen transparent').split(' '));

// Colour-function grammar, matching what the Chromium canvas accepts. The number pattern
// splits unambiguously (digits first, or a leading dot), so matching stays linear.
const NUM = String.raw`[+-]?(?:\d+(?:\.\d+)?|\.\d+)`;
const PCT = `${NUM}%`;
const ALPHA = `${NUM}%?`;
const ANGLE = `${NUM}(?:deg)?`;
const COMMA = String.raw`\s*,\s*`;
const SPACE = String.raw`\s+`;
const SLASH = String.raw`\s*/\s*`;
const triple = (a, b, c, sep) => `${a}${sep}${b}${sep}${c}`;
const colorFn = (name, body) => new RegExp(String.raw`^${name}a?\(\s*${body}\s*\)$`);
const COLOR_FN_RES = [
  // legacy comma syntax: rgb is all numbers or all percentages; hsl s and l need %
  colorFn('rgb', `(?:${triple(NUM, NUM, NUM, COMMA)}|${triple(PCT, PCT, PCT, COMMA)})(?:${COMMA}${ALPHA})?`),
  colorFn('hsl', `${triple(ANGLE, PCT, PCT, COMMA)}(?:${COMMA}${ALPHA})?`),
  // modern space syntax: alpha follows "/"
  colorFn('rgb', `(?:${triple(NUM, NUM, NUM, SPACE)}|${triple(PCT, PCT, PCT, SPACE)})(?:${SLASH}${ALPHA})?`),
  colorFn('hsl', `${triple(ANGLE, PCT, PCT, SPACE)}(?:${SLASH}${ALPHA})?`),
];
const MAX_COLOR_LENGTH = 64;

/** Hex, rgb()/rgba()/hsl()/hsla() or a CSS colour name. */
function isValidColor(c) {
  if (typeof c !== 'string') return false;
  const v = c.trim().toLowerCase();
  if (v.length > MAX_COLOR_LENGTH) return false;
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v)) return true;
  if (COLOR_FN_RES.some((re) => re.test(v))) return true;
  return NAMED_COLORS.has(v);
}

const GUIDE_TEXT = `OpenPen usage guide

OpenPen draws annotations on top of the user's screen. Take a screenshot first, draw, then take a screenshot again to check.

## Coordinates and colours

Every drawing coordinate is a pixel of the ${P}screenshot image of the target display: origin at the top-left, x to the right, y downwards. Coordinates are screenshot pixels, not points or percentages. Every tool that takes a display accepts an optional displayId (from ${P}get_state); without it the display under the mouse cursor is used. Coordinates must lie inside that display's pixel size.

Draw tools take an optional color and lineWidth. lineWidth is in screenshot pixels and must be greater than 0 (default ${DEFAULT_LINE_WIDTH}, highlighter ${DEFAULT_HIGHLIGHTER_LINE_WIDTH}). color accepts:
- hex with 3, 4, 6 or 8 digits: "#f00", "#f008", "#FF0000", "#FF000080"
- rgb() or rgba(): "rgb(255, 0, 0)", "rgba(255, 0, 0, 0.5)"
- hsl() or hsla(): "hsl(0, 100%, 50%)", "hsla(0, 100%, 50%, 0.5)"
- a CSS colour name such as "red" or "steelblue"
The default colour is ${DEFAULT_COLOR}.
Translucent colours are written with rgba(), hsla() or 8-digit hex (#RRGGBBAA); alpha runs from 0 (invisible) to 1 (opaque). There is no separate opacity parameter, so transparency can only be set inside the colour string.

## Tools: limits and what each is good for

- ${P}get_guide: returns this text. Use it once before the first drawing.
- ${P}get_state: drawing mode, active tool, the tool ids set_tool accepts and the displays (id, pixel size, which one holds the cursor). Use it to find displayId values.
- ${P}set_drawing_mode {enabled}: turn drawing mode on or off. Turning it off hides every annotation from the screen (they are kept, and appear again when drawing mode is turned back on). While it is on, the overlay takes the mouse, so the user cannot click through to the apps below. The draw tools switch it on themselves.
- ${P}set_tool {tool}: select the active tool by id; the control bar follows. Valid ids: ${BUILTIN_DRAWING_TOOL_IDS.join(', ')}. It only changes what the user's mouse will draw next; the draw tools below do not need it.
- ${P}draw_freehand {points:[{x,y},...], color?, lineWidth?, displayId?}: a free line through two or more points with round line ends. Good for curves, circles, organic shapes and handwriting; there is no curve tool, so place many closely spaced points.
- ${P}draw_line {x1,y1,x2,y2, color?, lineWidth?, displayId?}: a straight line with round line ends. Good for underlines, connectors and arrow shafts or heads built from several lines.
- ${P}draw_rect {x,y,width,height, color?, lineWidth?, displayId?}: a rectangle outline only, not filled. Good for framing a region of the screen; to tint an area, highlight it instead.
- ${P}draw_ellipse {x,y,width,height, color?, lineWidth?, displayId?}: an ellipse outline only, not filled, inscribed in that box. Good for circling an item; a square box gives a circle.
- ${P}draw_highlighter {points:[{x,y},...], color?, lineWidth?, displayId?}: a wide translucent stroke with round line ends, always semi-transparent. Good for marking text or a band of the screen without hiding it.
- ${P}list_annotations {displayId?}: annotations on the display, each with id, kind and bounds in screenshot pixels.
- ${P}delete_annotation {id, displayId?}: remove one annotation by id. The deletion is permanent; undo and redo cannot bring it back.
- ${P}clear_canvas {displayId?}: remove every annotation on the display.
- ${P}undo / ${P}redo {displayId?}: same as the user's undo and redo; they cover drawing and clearing the canvas, not deleting an annotation.
- ${P}screenshot {displayId?}: PNG of the display including the annotations already drawn.

All line ends are round. Shapes have no fill and there is no curve tool.

## Composing a drawing

Draw from background to foreground: large areas and outlines first, details last, so later strokes sit on top. Build curves and organic shapes with ${P}draw_freehand using many points rather than a few straight lines; a scene made only of straight lines looks rigid. Pick colours that contrast with what is on screen, and use a translucent colour when the annotation must not hide the content underneath. Keep lineWidth proportional to the size of what you draw.

## Example

Assume ${P}screenshot reported a 1920x1080 display. Mark a button with a frame, an arrow and a highlight over its label (all coordinates are screenshot pixels inside 1920x1080):
1. ${P}draw_rect {"x":800,"y":500,"width":320,"height":90,"color":"#FF3B30","lineWidth":4}
2. ${P}draw_line {"x1":600,"y1":300,"x2":780,"y2":480,"color":"#FF3B30","lineWidth":4}
3. ${P}draw_line {"x1":780,"y1":480,"x2":740,"y2":470,"color":"#FF3B30","lineWidth":4}
4. ${P}draw_line {"x1":780,"y1":480,"x2":770,"y2":440,"color":"#FF3B30","lineWidth":4}
5. ${P}draw_highlighter {"points":[{"x":820,"y":545},{"x":1100,"y":545}],"color":"rgba(255, 220, 0, 0.5)","lineWidth":24}
6. ${P}screenshot {} to check the result.

## Checking your work

After composing several strokes, take one screenshot and compare it with what you intended; after a correction, take one more. A single simple action, such as one line or one undo, does not need a screenshot.

## Common mistakes

- Using coordinates from your own estimate of the screen instead of pixels of the ${P}screenshot image; always read positions off the latest screenshot.
- A colour that is not in one of the formats above (for example "rgb 255 0 0" or "#12"): the call fails and nothing is drawn.
- lineWidth of 0 or less; lineWidth must be greater than 0.
- Expecting rect or ellipse to be filled, or looking for a curve or opacity tool; none exists.
- Calling ${P}delete_annotation with a guessed id: call ${P}list_annotations first, then delete using an id it returned, and take a screenshot to confirm.

If a call fails the canvas is unchanged; the error text says what to do next.`;

const text = (t) => ({ content: [{ type: 'text', text: t }] });
const fail = (t) => ({ content: [{ type: 'text', text: t }], isError: true });
const json = (value) => text(JSON.stringify(value, null, 2));

const displayId = z.number().int().optional().describe('Display id from get_state; defaults to the display under the cursor.');
const style = {
  color: z.string().optional().describe(`CSS colour: hex with 3, 4, 6 or 8 digits ("#ff0000"), rgb()/rgba(), hsl()/hsla() or a colour name. Translucency only through rgba, hsla or 8-digit hex (alpha 0 to 1); there is no separate opacity parameter. Default ${DEFAULT_COLOR}.`),
  lineWidth: z.number().optional().describe(`Line width in screenshot pixels, greater than 0; line ends are round. Default ${DEFAULT_LINE_WIDTH} (highlighter ${DEFAULT_HIGHLIGHTER_LINE_WIDTH}).`),
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
      return `${P}${name}: color "${args.color}" is not a valid CSS colour. Use hex like "#FF0000", rgb(255,0,0), rgba(255,0,0,0.5), hsl(200,50%,50%) or a name like "red", or omit color to use ${DEFAULT_COLOR}.`;
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
    ['get_guide', 'Returns the OpenPen usage guide as text. Suited to reading once before the first drawing, or whenever a limit or format is unclear. Not for inspecting the live screen; it never changes anything. Takes no parameters; the guide covers coordinates, colour formats, each tool and a worked example.', true,
      async () => text(GUIDE_TEXT)],
    ['get_state', 'Reports the current drawing mode, the active tool, the tool ids that can be selected and the connected displays with their id, pixel size, scale factor and whether the mouse cursor is on them. Suited to finding a display id before drawing on a multi-monitor setup, or to checking whether drawing mode is on. It does not list annotations and changes nothing. Takes no parameters.', true,
      async () => json(host.getState())],
    ['set_drawing_mode', 'Turns OpenPen drawing mode on or off. Suited to hiding the annotations from the screen or showing them again. Turning it off hides every annotation (they stay saved and reappear when it is turned on); while it is on, the overlay takes the mouse, so the user cannot click through to the apps below. The draw tools switch it on by themselves. It does not draw anything or change the selected tool. Parameter: enabled, true or false.', false, async ({ enabled }) => {
      if (typeof enabled !== 'boolean') return fail(`${P}set_drawing_mode needs "enabled": true or false.`);
      host.setDrawingMode(enabled);
      return json({ drawingMode: enabled });
    }],
    ['set_tool', 'Selects the active drawing tool by id, and the control bar follows. Suited to handing the user a specific tool, such as the highlighter or an eraser, to continue with by mouse. It does not draw anything, and the draw tools do not need it. Parameter: tool, one of the ids reported in the current state, such as "freehand", "line", "shape" or "highlighter-pen".', false, async ({ tool }) => {
      if (typeof tool !== 'string' || !tool) return fail(`${P}set_tool needs a "tool" id such as "freehand". Call ${P}get_state to see the current tool.`);
      const known = host.getState().tools ?? BUILTIN_DRAWING_TOOL_IDS;
      if (!known.includes(tool)) {
        return fail(`Unknown tool "${tool}". Valid tool ids: ${known.join(', ')}. Call ${P}set_tool again with one of them; nothing was changed.`);
      }
      host.setTool(tool);
      return json({ tool });
    }],
    ['draw_freehand', 'Draws a free line through a list of points, joined in order, with round line ends. Suited to curves, circles, arcs, handwriting and other organic shapes; place many closely spaced points for a smooth result, because there is no curve tool. Not suited to straight lines or boxes, and it cannot fill an area. Parameters: points, at least two {x, y} items in pixels of the display screenshot; optional color (hex with 3, 4, 6 or 8 digits, rgb(), rgba(), hsl(), hsla() or a CSS name; use rgba, hsla or 8-digit hex for translucency; default #818CF8), lineWidth in pixels greater than 0 (default 4) and displayId.', false, strokeTool('draw_freehand', 'freehand')],
    ['draw_line', 'Draws one straight line between two points, with round line ends. Suited to underlines, pointers, connectors, and arrows made from a shaft plus two short lines for the head. Not suited to curves; it draws no arrowheads of its own. Parameters: x1, y1, x2, y2 in pixels of the display screenshot; optional color (hex with 3, 4, 6 or 8 digits, rgb(), rgba(), hsl(), hsla() or a CSS name; use rgba, hsla or 8-digit hex for translucency; default #818CF8), lineWidth in pixels greater than 0 (default 4) and displayId.', false, lineTool],
    ['draw_rect', 'Draws a rectangle outline. Suited to framing a button, a region or a block of text so the user can see it. The rectangle is an outline only and is not filled, so it does not hide or tint what is inside; use a highlight to tint an area. Parameters: x and y of the top-left corner, width and height, all in pixels of the display screenshot, with width and height greater than 0 and the whole box inside the display; optional color (hex with 3, 4, 6 or 8 digits, rgb(), rgba(), hsl(), hsla() or a CSS name; default #818CF8), lineWidth in pixels greater than 0 (default 4) and displayId.', false, boxTool('draw_rect', 'rect')],
    ['draw_ellipse', 'Draws an ellipse outline inscribed in a box. Suited to circling an item, a face or a number; a square box gives a circle. The ellipse is an outline only and is not filled, so it does not hide or tint what is inside. Parameters: x and y of the top-left corner of the box, width and height, all in pixels of the display screenshot, with width and height greater than 0 and the whole box inside the display; optional color (hex with 3, 4, 6 or 8 digits, rgb(), rgba(), hsl(), hsla() or a CSS name; default #818CF8), lineWidth in pixels greater than 0 (default 4) and displayId.', false, boxTool('draw_ellipse', 'ellipse')],
    ['draw_highlighter', 'Draws a wide translucent highlighter stroke through a list of points, with round line ends. Suited to marking a line of text or a band of the screen while keeping the content underneath readable. The stroke is always semi-transparent, so it is not suited to hiding anything, and it cannot be made opaque. Parameters: points, at least two {x, y} items in pixels of the display screenshot; optional color (hex with 3, 4, 6 or 8 digits, rgb(), rgba(), hsl(), hsla() or a CSS name; default #818CF8), lineWidth in pixels greater than 0 (default 16) and displayId.', false, strokeTool('draw_highlighter', 'highlighter')],
    ['list_annotations', 'Lists the annotations currently on a display, each with its id, kind (for example freehand, line, rect, ellipse or highlighter; other kinds can appear) and bounds in screenshot pixels. Suited to finding the id of an annotation before removing it, or to checking what is already drawn without taking an image. It does not change anything. Parameter: optional displayId, defaulting to the display under the cursor.', true,
      simpleCommand('list', (result, d) => json({ displayId: d.id, annotations: result?.annotations ?? [] }))],
    ['delete_annotation', 'Removes one annotation, identified by its id. Suited to removing a single stroke or shape while keeping the rest; ids come from the annotation list. The deletion is permanent and cannot be undone or redone. It cannot delete by position or kind, and an unknown id leaves the canvas unchanged. Parameters: id, the annotation id as a string, and optional displayId, defaulting to the display under the cursor.', false, async ({ id, displayId: did }) => {
      if (typeof id !== 'string' || !id) return fail(`${P}delete_annotation needs the annotation "id". Call ${P}list_annotations to get ids.`);
      const r = resolveDisplay(did);
      if (r.error) return fail(r.error);
      const { result, failure } = await dispatch(r.display, { type: 'delete', id });
      if (failure) return failure;
      if (!result?.deleted) return fail(`No annotation with id "${id}" on display ${r.display.id}. Call ${P}list_annotations to see the current ids.`);
      return json({ deleted: true, id });
    }],
    ['clear_canvas', 'Removes every annotation on a display. Suited to starting over from a clean canvas. It affects everything drawn there, including strokes the user drew by hand, so a single mistake is better corrected by removing just that annotation. Parameter: optional displayId, defaulting to the display under the cursor.', false,
      simpleCommand('clear', (_r, d) => json({ cleared: true, displayId: d.id }))],
    ['undo', 'Undoes the most recent drawing or clear-canvas action on a display, exactly as if the user pressed undo (removing an annotation does not count and cannot be undone). Suited to taking back the last stroke or the last clear. It cannot target an older change. Parameter: optional displayId, defaulting to the display under the cursor.', false,
      simpleCommand('undo', (_r, d) => json({ undone: true, displayId: d.id }))],
    ['redo', 'Redoes the most recently undone change on a display, exactly as if the user pressed redo. Suited to restoring something an undo removed by mistake. It cannot redo anything that was not undone first. Parameter: optional displayId, defaulting to the display under the cursor.', false,
      simpleCommand('redo', (_r, d) => json({ redone: true, displayId: d.id }))],
    ['screenshot', 'Captures a PNG screenshot of a display, including the annotations already drawn, and returns it with its pixel width and height. Suited to looking at the screen before drawing and to checking the result afterwards. All drawing coordinates are pixels of this image, with the origin at the top-left. It captures one display at a time and cannot capture a region. Parameter: optional displayId, defaulting to the display under the cursor.', true, async ({ displayId: did }) => {
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
