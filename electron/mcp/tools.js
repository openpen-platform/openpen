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
  'paint_strokes', 'fill_regions',
  'list_annotations', 'delete_annotation', 'clear_canvas', 'undo', 'redo', 'screenshot',
].map((n) => P + n));

export const READ_ONLY_TOOL_NAMES = Object.freeze(
  ['get_guide', 'get_state', 'list_annotations', 'screenshot'].map((n) => P + n),
);

export const SERVER_INSTRUCTIONS =
  `Before you start, call ${P}get_guide. ` +
  'OpenPen is a screen-annotation overlay: it lets you draw lines, shapes and highlights on top of what the user sees on screen. ' +
  'The usual loop is to take a screenshot, draw, then take another screenshot to check the result. ' +
  'It also supports painting, with batches of smooth brush strokes and filled regions and a screenshot check between stages. ' +
  'The guide covers the coordinate system, colour formats, the limits and best use of each tool, a worked example and common mistakes.';

/** Appended to the instructions the endpoint serves: how plugin tools are named and where their usage is read. */
export const PLUGIN_INSTRUCTIONS =
  `Plugin tools are named <plugin>__<tool>; read how to use one with ${P}get_guide and its "plugin" parameter.`;

/** Built-in drawing tool ids, used when the host does not report its own list. */
export const BUILTIN_DRAWING_TOOL_IDS = Object.freeze(['freehand', 'line', 'shape', 'highlighter-pen', 'eraser', 'stroke-eraser']);

/** Most strokes (or regions) one painting call may carry. */
export const MAX_ITEMS_PER_CALL = 250;
/** Most points one outline may have: a stroke's path, a fill's outline, or one hole. */
export const MAX_POINTS_PER_ITEM = 1000;
/** Painting items allowed since the last screenshot; once reached, painting is refused until a screenshot succeeds. */
export const STROKES_BEFORE_SCREENSHOT = 250;
/** Finest grid spacing the screenshot tool accepts, in screenshot pixels. */
const MIN_GRID = 4;

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
Translucent colours are written with rgba(), hsla() or 8-digit hex (#RRGGBBAA); alpha runs from 0 (invisible) to 1 (opaque). The draw tools have no separate opacity parameter, so transparency there can only be set inside the colour string. ${P}paint_strokes and ${P}fill_regions take an opacity parameter of their own.

## Tools: limits and what each is good for

- ${P}get_guide: returns this text. Use it once before the first drawing.
- ${P}get_state: drawing mode, active tool, the tool ids set_tool accepts and the displays (id, pixel size, which one holds the cursor). Use it to find displayId values.
- ${P}set_drawing_mode {enabled}: turn drawing mode on or off. Turning it off hides every annotation from the screen (they are kept, and appear again when drawing mode is turned back on). While it is on, the overlay takes the mouse, so the user cannot click through to the apps below. The draw tools switch it on themselves.
- ${P}set_tool {tool}: select the active tool by id; the control bar follows. Valid ids: ${BUILTIN_DRAWING_TOOL_IDS.join(', ')}. It only changes what the user's mouse will draw next; the draw tools below do not need it.
- ${P}draw_freehand {points:[{x,y},...], color?, lineWidth?, displayId?}: a free line through two or more points with round line ends. Good for quick curves, circles and handwriting as an annotation; for smooth curves in a painting use ${P}paint_strokes with smooth.
- ${P}draw_line {x1,y1,x2,y2, color?, lineWidth?, displayId?}: a straight line with round line ends. Good for underlines, connectors and arrow shafts or heads built from several lines.
- ${P}draw_rect {x,y,width,height, color?, lineWidth?, displayId?}: a rectangle outline only, not filled. Good for framing a region of the screen; to colour a large area, use ${P}fill_regions instead.
- ${P}draw_ellipse {x,y,width,height, color?, lineWidth?, displayId?}: an ellipse outline only, not filled, inscribed in that box. Good for circling an item; a square box gives a circle.
- ${P}draw_highlighter {points:[{x,y},...], color?, lineWidth?, displayId?}: a wide translucent stroke with round line ends, always semi-transparent. Good for marking text or a band of the screen without hiding it.
- ${P}paint_strokes {strokes:[{points:[{x,y},...], smooth?, color?, width?, opacity?, hardness?},...], displayId?}: a batch of brush strokes drawn in order as one undoable step. Good for painting: smooth curves through every point, width and opacity that change along a stroke ({start,end}), soft edges. At most ${MAX_ITEMS_PER_CALL} strokes per call and ${MAX_POINTS_PER_ITEM} points per stroke.
- ${P}fill_regions {regions:[{shape:"polygon"|"rect"|"ellipse", points? or x,y,width,height, smooth?, holes?, color?, opacity?, hardness?},...], displayId?}: a batch of filled areas drawn in order as one undoable step. Good for laying down colour masses, with holes cut out of them. At most ${MAX_ITEMS_PER_CALL} regions per call and ${MAX_POINTS_PER_ITEM} points per outline.
- ${P}list_annotations {displayId?}: annotations on the display, each with id, kind (freehand, line, rect, ellipse, highlighter, brush or fill) and bounds in screenshot pixels.
- ${P}delete_annotation {id, displayId?}: remove one annotation by id. The deletion is permanent; undo and redo cannot bring it back.
- ${P}clear_canvas {displayId?}: remove every annotation on the display.
- ${P}undo / ${P}redo {displayId?}: same as the user's undo and redo; they cover drawing and clearing the canvas, not deleting an annotation. A whole painted batch is one step, so one undo removes it.
- ${P}screenshot {displayId?, region?:{x,y,width,height}, grid?}: PNG of the display including the annotations already drawn. region (screenshot pixels) returns that area enlarged, up to 8 times, with its long side about 1600 px; a region larger than that comes back smaller. grid (a whole number of at least ${MIN_GRID}, in screenshot pixels) overlays labelled lines every grid pixels; the labels are screenshot coordinates, usable as drawing coordinates. The reply text lists region, scale (output pixels per screenshot pixel) and grid; for a position (px, py) in a region view, the screenshot pixel is x = region.x + px / scale, y = region.y + py / scale.

The line ends of the draw tools are round. Their rect and ellipse have no fill; use ${P}fill_regions for filled areas and ${P}paint_strokes with smooth for curves.

## Composing a drawing

Draw from background to foreground: large areas and outlines first, details last, so later strokes sit on top. Build curves and organic shapes with ${P}paint_strokes and smooth rather than a few straight lines; a scene made only of straight lines looks rigid. Pick colours that contrast with what is on screen, and use a translucent colour when the annotation must not hide the content underneath. Keep lineWidth proportional to the size of what you draw.

## Painting

Use painting when the goal is a picture rather than a mark-up. Each call takes at most ${MAX_ITEMS_PER_CALL} strokes or regions and ${MAX_POINTS_PER_ITEM} points per outline (a stroke's path, a fill's outline, each hole). After ${STROKES_BEFORE_SCREENSHOT} strokes or regions without a successful screenshot, the next painting call is refused until you take one. The draw tools are neither counted nor refused.

Work in stages. For each stage write down its goal and a stroke budget first, paint, then take a screenshot and compare it with the goal before the next stage:
1. Composition and palette: place the main masses, set proportions and pick 4 to 6 colours. No strokes yet; a screenshot of the target area is enough.
2. Large colour areas: lay the background and big shapes with ${P}fill_regions, from back to front, in about 5 to 20 regions.
3. Light, shadow and form: add value changes with translucent or soft-edged fills and wide strokes, about 20 to 60 strokes.
4. Structure: draw outlines and edges with ${P}paint_strokes and smooth curves, thick strokes first and thin ones later, about 30 to 100 strokes.
5. Detail and highlights: small features and bright accents, in small batches of at most 40 strokes, with a screenshot after each batch.
6. Finish: only fix what is wrong and refine edges; do not add new elements.

If a stage went wrong, undo it first: a whole batch is one undo step. Do not paint over the same spot again and again; undo or delete the part and redo it once. Keep strokes within the display and use ${P}screenshot with region to inspect small areas.

A reference image may be looked at to observe its shapes, colours and light. Do not paste it into the canvas, do not trace it, and do not write a script or program that converts its pixels into strokes; paint by judging what you see.

Use ${P}draw_rect and ${P}draw_ellipse only to frame or mark something, not as painted shapes.

## Example

Assume ${P}screenshot reported a 1920x1080 display. Mark a button with a frame, an arrow and a highlight over its label (all coordinates are screenshot pixels inside 1920x1080):
1. ${P}draw_rect {"x":800,"y":500,"width":320,"height":90,"color":"#FF3B30","lineWidth":4}
2. ${P}draw_line {"x1":600,"y1":300,"x2":780,"y2":480,"color":"#FF3B30","lineWidth":4}
3. ${P}draw_line {"x1":780,"y1":480,"x2":740,"y2":470,"color":"#FF3B30","lineWidth":4}
4. ${P}draw_line {"x1":780,"y1":480,"x2":770,"y2":440,"color":"#FF3B30","lineWidth":4}
5. ${P}draw_highlighter {"points":[{"x":820,"y":545},{"x":1100,"y":545}],"color":"rgba(255, 220, 0, 0.5)","lineWidth":24}
6. ${P}screenshot {} to check the result.

## Checking your work

After composing several strokes, take one screenshot and compare it with what you intended; after a correction, take one more. A single simple action, such as one line or one undo, does not need a screenshot. While painting, a screenshot is required after every ${STROKES_BEFORE_SCREENSHOT} strokes or regions.

## Common mistakes

- Using coordinates from your own estimate of the screen instead of pixels of the ${P}screenshot image; always read positions off the latest screenshot.
- A colour that is not in one of the formats above (for example "rgb 255 0 0" or "#12"): the call fails and nothing is drawn.
- lineWidth of 0 or less; lineWidth must be greater than 0.
- Expecting ${P}draw_rect or ${P}draw_ellipse to be filled: they are outlines only. Use ${P}fill_regions for filled areas, ${P}paint_strokes with smooth for curves, and the opacity parameter of those two for transparency.
- Sending a painting batch with one bad item: the whole batch is rejected and nothing is drawn; fix the item named in the error and resend.
- Calling ${P}delete_annotation with a guessed id: call ${P}list_annotations first, then delete using an id it returned, and take a screenshot to confirm.

If a call fails the canvas is unchanged; the error text says what to do next.`;

const text = (t) => ({ content: [{ type: 'text', text: t }] });
const fail = (t) => ({ content: [{ type: 'text', text: t }], isError: true });
const json = (value) => text(JSON.stringify(value, null, 2));

const displayId = z.number().int().optional().describe('Display id from get_state; defaults to the display under the cursor.');
const style = {
  color: z.string().optional().describe(`CSS colour: hex with 3, 4, 6 or 8 digits ("#ff0000"), rgb()/rgba(), hsl()/hsla() or a colour name. Translucency only through rgba, hsla or 8-digit hex (alpha 0 to 1); this tool has no separate opacity parameter. Default ${DEFAULT_COLOR}.`),
  lineWidth: z.number().optional().describe(`Line width in screenshot pixels, greater than 0; line ends are round. Default ${DEFAULT_LINE_WIDTH} (highlighter ${DEFAULT_HIGHLIGHTER_LINE_WIDTH}).`),
  displayId,
};
const point = z.object({ x: z.number(), y: z.number() });
const colorParam = z.string().optional().describe(`CSS colour: hex with 3, 4, 6 or 8 digits, rgb()/rgba(), hsl()/hsla() or a colour name. Default ${DEFAULT_COLOR}.`);
const rangeParam = (what) => z.union([z.number(), z.object({ start: z.number(), end: z.number() })]).optional().describe(what);
const hardnessParam = z.number().optional().describe('Edge hardness from 0 to 1; 1 is a hard edge (default), lower is softer.');
const smoothParam = z.boolean().optional();
const hole = z.object({
  points: z.array(point).optional().describe(`Outline of the hole, 3 to ${MAX_POINTS_PER_ITEM} {x, y} points; the area inside is left unfilled.`),
  smooth: smoothParam.describe('true rounds the outline into a smooth curve through every point.'),
});

// Argument fields are all optional in the schema on purpose: the handlers
// validate and answer with a message that names the valid range and the next
// step, which the protocol-level "invalid params" error cannot do.
const SCHEMAS = {
  get_guide: z.object({
    plugin: z.string().optional().describe('Id of a plugin from the Plugins index of this guide (for example "@scope/name"). Returns only that plugin\'s usage guide. Omit it for the general guide.'),
  }),
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
  paint_strokes: z.object({
    strokes: z.array(z.object({
      points: z.array(point).optional().describe(`Path of the stroke, 2 to ${MAX_POINTS_PER_ITEM} {x, y} points in screenshot pixels.`),
      smooth: smoothParam.describe('true draws a curve passing through every point; default false draws straight segments.'),
      color: colorParam,
      width: rangeParam('Width in screenshot pixels, greater than 0, or {start, end} to change along the stroke. Default 4.'),
      opacity: rangeParam('Opacity from 0 to 1, or {start, end} to change along the stroke. Default 1.'),
      hardness: hardnessParam,
    })).optional().describe(`The strokes, drawn in order; 1 to ${MAX_ITEMS_PER_CALL} per call.`),
    displayId,
  }),
  fill_regions: z.object({
    regions: z.array(z.object({
      shape: z.enum(['polygon', 'rect', 'ellipse']).optional().describe('polygon uses points; rect and ellipse use x, y, width and height.'),
      points: z.array(point).optional().describe(`Outline of a polygon, 3 to ${MAX_POINTS_PER_ITEM} {x, y} points; it closes by itself.`),
      smooth: smoothParam.describe('polygon only: true rounds the outline into a smooth curve through every point.'),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      holes: z.array(hole).optional().describe('Areas cut out of the fill. Holes must not overlap each other.'),
      color: colorParam,
      opacity: z.number().optional().describe('Opacity from 0 to 1. Default 1.'),
      hardness: hardnessParam,
    })).optional().describe(`The regions, drawn in order; 1 to ${MAX_ITEMS_PER_CALL} per call.`),
    displayId,
  }),
  list_annotations: z.object({ displayId }),
  delete_annotation: z.object({ id: z.string().optional(), displayId }),
  clear_canvas: z.object({ displayId }),
  undo: z.object({ displayId }),
  redo: z.object({ displayId }),
  screenshot: z.object({
    displayId,
    region: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional()
      .describe('Area to capture, in screenshot pixels. Small areas come back enlarged.'),
    grid: z.number().optional().describe(`Spacing in screenshot pixels of labelled grid lines drawn over the image, a whole number of at least ${MIN_GRID}.`),
  }),
};

/**
 * Plugin section of the guide: id and one-line summary of each exposed plugin,
 * never the plugins' own guide text (that is read per plugin on demand).
 */
function pluginIndex(exposed) {
  const lines = exposed.map((p) => `- ${p.pluginId}${p.summary ? `: ${p.summary}` : ''}`);
  return `Plugins\nThese plugins add tools named <plugin>__<tool>. Call ${P}get_guide with "plugin" set to one of these ids to read how to use its tools.\n${lines.join('\n')}`;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * @param {{
 *   getState: () => { drawingMode: boolean, tool: string, displays: Array<{ id: number, pixelWidth: number, pixelHeight: number, scaleFactor: number, isCursorDisplay: boolean }> },
 *   setDrawingMode: (enabled: boolean) => void,
 *   setTool: (id: string) => void,
 *   runOnOverlay: (displayId: number | undefined, command: object) => Promise<any>,
 *   screenshot: (displayId: number | undefined, options?: { region?: { x: number, y: number, width: number, height: number }, grid?: number }) => Promise<{ data: string, mimeType: string, width: number, height: number, displayId: number, region?: object, scale?: number, grid?: number }>,
 *   getPluginGuides?: () => Array<{ pluginId: string, summary?: string, guide?: string, tools: string[] }>,
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

  // ── Painting ──────────────────────────────────────────────────────────────
  // Painting items (strokes and regions) written since the last successful
  // screenshot. One counter for the whole server: not per display, not per client.
  let paintedSinceScreenshot = 0;
  // Bumped by every successful screenshot. A paint that fails after one must not
  // roll back a count the screenshot already cleared.
  let screenshotEpoch = 0;

  /** Message for the call that finds the screenshot guard closed, else null. */
  function guardProblem(name) {
    if (paintedSinceScreenshot < STROKES_BEFORE_SCREENSHOT) return null;
    return `${P}${name}: ${paintedSinceScreenshot} strokes or regions were painted since the last screenshot, and the limit is ${STROKES_BEFORE_SCREENSHOT}, so this call was refused and nothing was drawn. ` +
      `Call ${P}screenshot (a region view counts too), look at the result, then paint again.`;
  }

  /** Check a list of points. Returns an error message or null. */
  function pointsProblem(label, pts, min, d) {
    if (!Array.isArray(pts) || pts.length < min) return `${label} must be an array of at least ${min} {x, y} points.`;
    if (pts.length > MAX_POINTS_PER_ITEM) {
      return `${label} has ${pts.length} points and the limit is ${MAX_POINTS_PER_ITEM} per outline. Simplify it, or split it into several strokes or regions.`;
    }
    if (!pts.every((p) => p && inRange(d, p.x, p.y))) return `${label} has a point that is missing or outside the display.`;
    return null;
  }

  /** A number, or {start, end} of numbers, each within the bounds. Returns an error message or null. */
  function rangedProblem(label, v, { min, max, exclusiveMin = false }) {
    const ok = (n) => isNum(n) && (exclusiveMin ? n > min : n >= min) && n <= max;
    const bounds = `${exclusiveMin ? 'greater than' : 'at least'} ${min}${max === Infinity ? '' : ` and at most ${max}`}`;
    if (ok(v)) return null;
    if (v && typeof v === 'object' && !Array.isArray(v) && ok(v.start) && ok(v.end)) return null;
    return `${label} must be a number ${bounds}, or {start, end} with both numbers ${bounds}.`;
  }

  const copyRanged = (v) => (typeof v === 'number' ? v : { start: v.start, end: v.end });

  /** Fields shared by strokes and fills; returns { problem } or { out }. */
  function paintStyle(label, item, { rangedWidth }) {
    const out = {};
    if (item.color !== undefined) {
      if (!isValidColor(item.color)) {
        return { problem: `${label}: color "${item.color}" is not a valid CSS colour. Use hex like "#FF0000", rgb(255,0,0), rgba(255,0,0,0.5), hsl(200,50%,50%) or a name like "red", or omit color to use ${DEFAULT_COLOR}.` };
      }
      out.color = item.color.trim();
    }
    if (rangedWidth && item.width !== undefined) {
      const bad = rangedProblem(`${label}: width`, item.width, { min: 0, max: Infinity, exclusiveMin: true });
      if (bad) return { problem: bad };
      out.width = copyRanged(item.width);
    }
    if (item.opacity !== undefined) {
      const bad = rangedWidth
        ? rangedProblem(`${label}: opacity`, item.opacity, { min: 0, max: 1 })
        : (isNum(item.opacity) && item.opacity >= 0 && item.opacity <= 1 ? null : `${label}: opacity must be a number from 0 to 1.`);
      if (bad) return { problem: bad };
      out.opacity = rangedWidth ? copyRanged(item.opacity) : item.opacity;
    }
    if (item.hardness !== undefined) {
      if (!(isNum(item.hardness) && item.hardness >= 0 && item.hardness <= 1)) {
        return { problem: `${label}: hardness must be a number from 0 to 1 (1 is a hard edge).` };
      }
      out.hardness = item.hardness;
    }
    if (item.smooth !== undefined) {
      if (typeof item.smooth !== 'boolean') return { problem: `${label}: smooth must be true or false.` };
      out.smooth = item.smooth;
    }
    return { out };
  }

  const ptsOf = (pts) => pts.map((p) => ({ x: p.x, y: p.y }));

  function buildBrush(label, stroke, d) {
    if (!stroke || typeof stroke !== 'object') return { problem: `${label} must be an object with points.` };
    const bad = pointsProblem(`${label}: points`, stroke.points, 2, d);
    if (bad) return { problem: bad };
    const style = paintStyle(label, stroke, { rangedWidth: true });
    if (style.problem) return style;
    return { item: { kind: 'brush', points: ptsOf(stroke.points), ...style.out } };
  }

  function buildFill(label, region, d) {
    if (!region || typeof region !== 'object') return { problem: `${label} must be an object with a shape.` };
    const shape = region.shape;
    if (shape !== 'polygon' && shape !== 'rect' && shape !== 'ellipse') {
      return { problem: `${label}: shape must be "polygon", "rect" or "ellipse".` };
    }
    const item = { kind: 'fill', shape };
    if (shape === 'polygon') {
      const bad = pointsProblem(`${label}: points`, region.points, 3, d);
      if (bad) return { problem: bad };
      item.points = ptsOf(region.points);
    } else {
      const { x, y, width, height } = region;
      if (![x, y, width, height].every(isNum)) return { problem: `${label}: a ${shape} needs x, y, width and height as numbers.` };
      if (width <= 0 || height <= 0) return { problem: `${label}: width and height must be greater than 0.` };
      if (!inRange(d, x, y) || !inRange(d, x + width, y + height)) return { problem: `${label}: the ${shape} extends outside the display.` };
      Object.assign(item, { x, y, width, height });
    }
    const style = paintStyle(label, region, { rangedWidth: false });
    if (style.problem) return style;
    if (shape !== 'polygon') delete style.out.smooth;
    Object.assign(item, style.out);
    if (region.holes !== undefined) {
      if (!Array.isArray(region.holes)) return { problem: `${label}: holes must be an array of {points, smooth?} items.` };
      item.holes = [];
      for (const [h, holeDef] of region.holes.entries()) {
        const hl = `${label}: holes[${h}]`;
        if (!holeDef || typeof holeDef !== 'object') return { problem: `${hl} must be an object with points.` };
        const bad = pointsProblem(`${hl}: points`, holeDef.points, 3, d);
        if (bad) return { problem: bad };
        if (holeDef.smooth !== undefined && typeof holeDef.smooth !== 'boolean') return { problem: `${hl}: smooth must be true or false.` };
        item.holes.push({ points: ptsOf(holeDef.points), ...(holeDef.smooth !== undefined ? { smooth: holeDef.smooth } : {}) });
      }
    }
    return { item };
  }

  /** One painting call: validate the whole batch, then send it to the overlay as one command. */
  function paintTool(name, listKey, noun, build) {
    return async (args) => {
      const r = resolveDisplay(args.displayId);
      if (r.error) return fail(r.error);
      const d = r.display;
      const guard = guardProblem(name);
      if (guard) return fail(guard);
      const list = args[listKey];
      if (!Array.isArray(list) || list.length === 0) {
        return invalid(name, `${listKey} must be an array with at least 1 ${noun}.`, d);
      }
      if (list.length > MAX_ITEMS_PER_CALL) {
        return fail(`${P}${name}: ${list.length} ${listKey} were sent and the limit is ${MAX_ITEMS_PER_CALL} per call, so nothing was drawn. Split the batch into multiple smaller calls of at most ${MAX_ITEMS_PER_CALL}.`);
      }
      const items = [];
      for (const [i, entry] of list.entries()) {
        const built = build(`${listKey}[${i}]`, entry, d);
        if (built.problem) return invalid(name, `${built.problem} Nothing was drawn.`, d);
        items.push(built.item);
      }
      if (!host.getState().drawingMode) host.setDrawingMode(true);
      // Count before sending so concurrent calls cannot both slip under the limit.
      paintedSinceScreenshot += items.length;
      const epoch = screenshotEpoch;
      const { result, failure } = await dispatch(d, { type: 'paint', items });
      if (failure) {
        if (epoch === screenshotEpoch) paintedSinceScreenshot -= items.length;
        return failure;
      }
      return json({
        ids: result?.ids ?? [],
        displayId: d.id,
        strokesSinceScreenshot: paintedSinceScreenshot,
        guardLimit: STROKES_BEFORE_SCREENSHOT,
      });
    };
  }

  /** The optional region / grid of the screenshot tool. Returns { problem } or { options }. */
  function screenshotOptions(args, d) {
    const options = {};
    if (args.region !== undefined) {
      const g = args.region;
      if (!g || ![g.x, g.y, g.width, g.height].every(isNum)) {
        return { problem: 'region must be {x, y, width, height}, all numbers in screenshot pixels.' };
      }
      if (g.width <= 0 || g.height <= 0) return { problem: 'region width and height must be greater than 0.' };
      if (g.x < 0 || g.y < 0 || g.x + g.width > d.pixelWidth || g.y + g.height > d.pixelHeight) {
        return { problem: `region extends outside the display, which is ${d.pixelWidth}x${d.pixelHeight} px.` };
      }
      options.region = { x: g.x, y: g.y, width: g.width, height: g.height };
    }
    if (args.grid !== undefined) {
      if (!Number.isInteger(args.grid) || args.grid < MIN_GRID) {
        return { problem: `grid must be a whole number of at least ${MIN_GRID} (screenshot pixels between grid lines). Resend with an integer such as 100, or omit grid.` };
      }
      options.grid = args.grid;
    }
    return { options };
  }

  const defs = [
    ['get_guide', 'Returns the OpenPen usage guide as text. Suited to reading once before the first drawing, or whenever a limit or format is unclear. Not for inspecting the live screen; it never changes anything. Without arguments the guide covers coordinates, colour formats, each tool and a worked example, and, when add-ons that provide further tools are installed, ends with an index of them, each with a one-line summary. With the optional argument it returns only the usage guide of that one add-on.', true,
      async ({ plugin } = {}) => {
        const exposed = host.getPluginGuides?.() ?? [];
        if (plugin === undefined) return text(exposed.length ? `${GUIDE_TEXT}\n\n${pluginIndex(exposed)}` : GUIDE_TEXT);
        const entry = exposed.find((p) => p.pluginId === plugin);
        if (!entry) {
          return fail(`Plugin ${plugin} is not exposed. Next step: call ${P}get_guide without "plugin" to list the exposed plugins.`);
        }
        if (!entry.guide) {
          return fail(`Plugin ${plugin} provides no guide. Next step: rely on the tool descriptions in the tool list, or call ${P}get_guide without "plugin" for the plugin summary.`);
        }
        return text(`Guide from plugin ${plugin} (tools: ${entry.tools.join(', ')})\n\n${entry.guide}`);
      }],
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
    ['draw_freehand', 'Draws a free line through a list of points, joined in order, with round line ends. Suited to curves, circles, arcs, handwriting and other organic shapes; place many closely spaced points for a smooth result. Not suited to straight lines or boxes, it cannot fill an area, and it has no opacity setting beyond the colour. Parameters: points, at least two {x, y} items in pixels of the display screenshot; optional color (hex with 3, 4, 6 or 8 digits, rgb(), rgba(), hsl(), hsla() or a CSS name; use rgba, hsla or 8-digit hex for translucency; default #818CF8), lineWidth in pixels greater than 0 (default 4) and displayId.', false, strokeTool('draw_freehand', 'freehand')],
    ['draw_line', 'Draws one straight line between two points, with round line ends. Suited to underlines, pointers, connectors, and arrows made from a shaft plus two short lines for the head. Not suited to curves; it draws no arrowheads of its own. Parameters: x1, y1, x2, y2 in pixels of the display screenshot; optional color (hex with 3, 4, 6 or 8 digits, rgb(), rgba(), hsl(), hsla() or a CSS name; use rgba, hsla or 8-digit hex for translucency; default #818CF8), lineWidth in pixels greater than 0 (default 4) and displayId.', false, lineTool],
    ['draw_rect', 'Draws a rectangle outline. Suited to framing a button, a region or a block of text so the user can see it. The rectangle is an outline only and is not filled, so it does not hide or tint what is inside; to colour a large area, use the tool that fills regions with colour. Parameters: x and y of the top-left corner, width and height, all in pixels of the display screenshot, with width and height greater than 0 and the whole box inside the display; optional color (hex with 3, 4, 6 or 8 digits, rgb(), rgba(), hsl(), hsla() or a CSS name; default #818CF8), lineWidth in pixels greater than 0 (default 4) and displayId.', false, boxTool('draw_rect', 'rect')],
    ['draw_ellipse', 'Draws an ellipse outline inscribed in a box. Suited to circling an item, a face or a number; a square box gives a circle. The ellipse is an outline only and is not filled, so it does not hide or tint what is inside. Parameters: x and y of the top-left corner of the box, width and height, all in pixels of the display screenshot, with width and height greater than 0 and the whole box inside the display; optional color (hex with 3, 4, 6 or 8 digits, rgb(), rgba(), hsl(), hsla() or a CSS name; default #818CF8), lineWidth in pixels greater than 0 (default 4) and displayId.', false, boxTool('draw_ellipse', 'ellipse')],
    ['draw_highlighter', 'Draws a wide translucent highlighter stroke through a list of points, with round line ends. Suited to marking a line of text or a band of the screen while keeping the content underneath readable. The stroke is always semi-transparent, so it is not suited to hiding anything, and it cannot be made opaque. Parameters: points, at least two {x, y} items in pixels of the display screenshot; optional color (hex with 3, 4, 6 or 8 digits, rgb(), rgba(), hsl(), hsla() or a CSS name; default #818CF8), lineWidth in pixels greater than 0 (default 16) and displayId.', false, strokeTool('draw_highlighter', 'highlighter')],
    ['paint_strokes', `Draws a batch of brush strokes in one call, in order, as a single undoable step. Suited to painting: smooth curves that pass through every point, strokes whose width and opacity change along their length, soft edges for shading and blending, and many strokes at once. Not suited to filled areas or to a quick mark-up of the screen. A call takes at most ${MAX_ITEMS_PER_CALL} strokes of at most ${MAX_POINTS_PER_ITEM} points each, and once ${STROKES_BEFORE_SCREENSHOT} strokes or regions have been painted without a screenshot, further calls are refused until one is taken. If any stroke is invalid the whole batch is rejected and nothing is drawn. Parameters: strokes, a list where each item has points (at least two {x, y} items in pixels of the display screenshot) and optional smooth (true gives a curve through every point; default false gives straight segments), color (hex with 3, 4, 6 or 8 digits, rgb(), rgba(), hsl(), hsla() or a CSS name; default #818CF8), width (pixels greater than 0, or {start, end} to change along the stroke; default 4), opacity (0 to 1, or {start, end}; default 1) and hardness (0 to 1, where 1 is a hard edge and lower is softer; default 1); plus optional displayId.`, false,
      paintTool('paint_strokes', 'strokes', 'stroke', buildBrush)],
    ['fill_regions', `Fills a batch of areas with colour in one call, in order, as a single undoable step. Suited to laying down large colour masses, backgrounds and shapes, with holes cut out of them, and with optional soft edges. Not suited to outlines or lines. A call takes at most ${MAX_ITEMS_PER_CALL} regions of at most ${MAX_POINTS_PER_ITEM} points per outline, and once ${STROKES_BEFORE_SCREENSHOT} strokes or regions have been painted without a screenshot, further calls are refused until one is taken. If any region is invalid the whole batch is rejected and nothing is drawn. Parameters: regions, a list where each item has shape "polygon" with points (at least three {x, y} items in pixels of the display screenshot, closed automatically, and optional smooth for a curved outline), or shape "rect" or "ellipse" with x, y, width and height of its box; each may have holes (a list of {points, smooth?} with at least three points each; holes must not overlap each other), color (hex with 3, 4, 6 or 8 digits, rgb(), rgba(), hsl(), hsla() or a CSS name; default #818CF8), opacity (0 to 1; default 1) and hardness (0 to 1, where 1 is a hard edge and lower is softer; default 1); plus optional displayId.`, false,
      paintTool('fill_regions', 'regions', 'region', buildFill)],
    ['list_annotations', 'Lists the annotations currently on a display, each with its id, kind (for example freehand, line, rect, ellipse, highlighter, brush or fill; other kinds can appear) and bounds in screenshot pixels. Suited to finding the id of an annotation before removing it, or to checking what is already drawn without taking an image. It does not change anything. Parameter: optional displayId, defaulting to the display under the cursor.', true,
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
    ['undo', 'Undoes the most recent drawing or clear-canvas action on a display, exactly as if the user pressed undo (removing an annotation does not count and cannot be undone). Suited to taking back the last stroke or the last clear; a whole painted batch counts as one action, so one undo removes all of it. It cannot target an older change. Parameter: optional displayId, defaulting to the display under the cursor.', false,
      simpleCommand('undo', (_r, d) => json({ undone: true, displayId: d.id }))],
    ['redo', 'Redoes the most recently undone change on a display, exactly as if the user pressed redo. Suited to restoring something an undo removed by mistake. It cannot redo anything that was not undone first. Parameter: optional displayId, defaulting to the display under the cursor.', false,
      simpleCommand('redo', (_r, d) => json({ redone: true, displayId: d.id }))],
    ['screenshot', `Captures a PNG screenshot of a display, including the annotations already drawn, and returns it with its pixel width and height. Suited to looking at the screen before drawing and to checking the result afterwards. All drawing coordinates are pixels of this image, with the origin at the top-left. It captures one display at a time. With a region it returns just that area enlarged (up to 8 times, long side about 1600 px; a region larger than that comes back smaller), and with a grid it draws labelled lines over the image, the labels being coordinates of the full screenshot; the reply text then also gives the region, the scale (output pixels per screenshot pixel) and the grid so positions can be converted back. Painting is refused after too many strokes without a successful screenshot, and any successful one, region views included, lifts that. Parameters: optional displayId, defaulting to the display under the cursor; optional region {x, y, width, height} inside the display; optional grid, the spacing in screenshot pixels as a whole number, at least ${MIN_GRID}.`, true, async ({ displayId: did, region, grid }) => {
      const r = resolveDisplay(did);
      if (r.error) return fail(r.error);
      const opts = screenshotOptions({ region, grid }, r.display);
      if (opts.problem) return invalid('screenshot', opts.problem, r.display);
      try {
        const shot = Object.keys(opts.options).length > 0
          ? await host.screenshot(r.display.id, opts.options)
          : await host.screenshot(r.display.id);
        paintedSinceScreenshot = 0;
        screenshotEpoch += 1;
        const info = { displayId: shot.displayId, width: shot.width, height: shot.height };
        for (const key of ['region', 'scale', 'grid']) if (shot[key] !== undefined) info[key] = shot[key];
        return {
          content: [
            { type: 'image', data: shot.data, mimeType: shot.mimeType },
            { type: 'text', text: JSON.stringify(info) },
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
 * is listed, and always when the plugin is disabled. Read-only mode keeps only
 * tools that cannot change the canvas.
 *
 * @param {Array<{ name: string, readOnly?: boolean, pluginId?: string }>} tools
 * @param {{ readOnly?: boolean, exposeAll?: boolean, enabledPlugins?: string[], disabledModules?: string[] }} config
 */
export function filterTools(tools, config = {}) {
  const { readOnly = false, exposeAll = true, enabledPlugins = [], disabledModules = [] } = config;
  return tools.filter((t) => {
    if (t.pluginId && disabledModules.includes(t.pluginId)) return false;
    if (readOnly && !t.readOnly) return false;
    if (t.pluginId && !exposeAll && !enabledPlugins.includes(t.pluginId)) return false;
    return true;
  });
}
