import type { SvgCursorSpec } from '@openpen/module-api'

/**
 * OpenPen cursor — shape
 * Variant: Framing square v2 · strong ants
 *
 * Rounded rectangle outline with marching ants and a corner anchor at the
 * top-left. The corner scales correctly around its own centre, with an indigo
 * flash radiating behind it.
 *
 * Tunable parameters (baked into the SVG strings below).
 * To iterate: share this block with Claude Code and ask for a delta,
 * or hand-edit the corresponding values in the SVG / @keyframes / @style.
 *
 *   lineColor      : '#111111'    Frame line color
 *   lineWidth      : 2            Frame line width  (0.5..3, step 0.1)
 *   cornerRadius   : 3.5          Frame corner radius  (0..8, step 0.25)
 *   frameInset     : 2.5          Frame inset from edge  (1.5..4, step 0.25)
 *   accent         : '#818cf8'    Ants & flash color
 *   antsDash       : 4            Ants dash size  (1..8, step 0.5)
 *   antsLineWidth  : 1.2          Ants line width  (0.4..3, step 0.1)
 *   antsSpeed      : 1            Ants loop · seconds  (0.3..3, step 0.1)
 *   anchorSize     : 4            Corner anchor size  (2..6, step 0.25)
 *   anchorColor    : '#111111'    Corner anchor fill
 *   flashOpacity   : 0.55         Flash opacity (0 = off)  (0..1, step 0.05)
 *   cornerScale    : 1.35         Corner pulse scale  (1..1.8, step 0.05)
 *   cornerDuration : 1.2          Corner loop · seconds  (0.5..2.4, step 0.1)
 *
 * PARAMS_JSON: {"lineColor":"#111111","lineWidth":2,"cornerRadius":3.5,"frameInset":2.5,"accent":"#818cf8","antsDash":4,"antsLineWidth":1.2,"antsSpeed":1,"anchorSize":4,"anchorColor":"#111111","flashOpacity":0.55,"cornerScale":1.35,"cornerDuration":1.2}
 *
 * Hotspot: { x: 2, y: 2 }
 */

export const shapeCursor: SvgCursorSpec = {
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">' +
    '<rect x="2.5" y="2.5" width="19" height="19" rx="3.5" stroke="#ffffff" stroke-width="3.6"/>' +
    '<rect x="2.5" y="2.5" width="19" height="19" rx="3.5" stroke="#111111" stroke-width="2"/>' +
    '<rect x="0.5" y="0.5" width="4" height="4" rx="0.8" fill="#111111" stroke="#ffffff" stroke-width="1"/>' +
    '</svg>',
  hotspot: { x: 2, y: 2 },
  fallback: 'crosshair',
}

export const shapeCursorAnimated: SvgCursorSpec = {
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">' +
    '<style>@keyframes openpen-shape-ants{0%{stroke-dashoffset:0}100%{stroke-dashoffset:-8}}@keyframes openpen-shape-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.35)}}@keyframes openpen-shape-flash{0%,100%{opacity:0;transform:scale(.6)}50%{opacity:0.55;transform:scale(1.4)}}.openpen-shape-ants{stroke-dasharray:4 4;animation:openpen-shape-ants 1s linear infinite}.openpen-shape-corner{transform-origin:2.5px 2.5px;animation:openpen-shape-pulse 1.2s ease-in-out infinite}.openpen-shape-flash{transform-origin:2.5px 2.5px;animation:openpen-shape-flash 1.2s ease-in-out infinite}</style>' +
    '<rect x="2.5" y="2.5" width="19" height="19" rx="3.5" stroke="#ffffff" stroke-width="3.6"/>' +
    '<rect x="2.5" y="2.5" width="19" height="19" rx="3.5" stroke="#111111" stroke-width="2"/>' +
    '<rect class="openpen-shape-ants" x="2.5" y="2.5" width="19" height="19" rx="3.5" stroke="var(--openpen-cursor-accent, #818cf8)" stroke-width="1.2"/>' +
    '<circle class="openpen-shape-flash" cx="2.5" cy="2.5" r="3.6" fill="var(--openpen-cursor-accent, #818cf8)"/>' +
    '<rect class="openpen-shape-corner" x="0.5" y="0.5" width="4" height="4" rx="0.8" fill="#111111" stroke="#ffffff" stroke-width="1"/>' +
    '</svg>',
  hotspot: { x: 2, y: 2 },
  fallback: 'crosshair',
}