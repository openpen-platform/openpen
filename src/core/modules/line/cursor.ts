import type { SvgCursorSpec } from '@openpen/module-api'

/**
 * OpenPen cursor — line
 * Variant: Draftsman's straightedge
 *
 * A slim diagonal ruler with tick marks. A larger indigo trace dot slides
 * along the edge — the line being drawn.
 *
 * Tunable parameters (baked into the SVG strings below).
 * To iterate: share this block with Claude Code and ask for a delta,
 * or hand-edit the corresponding values in the SVG / @keyframes / @style.
 *
 *   accent     : '#818cf8'    Accent color
 *   tracerSize : 2            Tracer size  (0.8..3.5, step 0.05)
 *   edgeGlow   : 1.6          Edge stroke  (0.8..3, step 0.1)
 *   duration   : 1.4          Loop · seconds  (0.8..3, step 0.1)
 *
 * PARAMS_JSON: {"accent":"#818cf8","tracerSize":2,"edgeGlow":1.6,"duration":1.4}
 *
 * Hotspot: { x: 2, y: 22 }
 */

export const lineCursor: SvgCursorSpec = {
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">' +
    '<path d="M 2 22 L 1 21 L 19 3 L 20 4 Z" fill="#ffffff" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M 2 22 L 1 21 L 19 3 L 20 4 Z" fill="#fafafa" stroke="#111111" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<line x1="6.5" y1="17.5" x2="6" y2="17" stroke="#111111" stroke-width="1" stroke-linecap="round"/>' +
    '<line x1="11" y1="13" x2="10.5" y2="12.5" stroke="#111111" stroke-width="1" stroke-linecap="round"/>' +
    '<line x1="15.5" y1="8.5" x2="15" y2="8" stroke="#111111" stroke-width="1" stroke-linecap="round"/>' +
    '<circle cx="2" cy="22" r="1.1" fill="#111111"/>' +
    '</svg>',
  hotspot: { x: 2, y: 22 },
  fallback: 'crosshair',
}

export const lineCursorAnimated: SvgCursorSpec = {
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">' +
    '<style>@keyframes openpen-line-trace{0%{transform:translate(0,0);opacity:0}10%{opacity:1}90%{opacity:1}100%{transform:translate(15px,-15px);opacity:0}}@keyframes openpen-line-edge{0%{stroke-dashoffset:26;opacity:.85}100%{stroke-dashoffset:0;opacity:0}}@keyframes openpen-line-tick{0%,100%{opacity:.4}50%{opacity:1}}.openpen-line-tracer{animation:openpen-line-trace 1.4s ease-out infinite}.openpen-line-edge{stroke-dasharray:26;animation:openpen-line-edge 1.4s ease-out infinite}.openpen-line-t1{animation:openpen-line-tick 1.4s ease-in-out -.1s infinite}.openpen-line-t2{animation:openpen-line-tick 1.4s ease-in-out -.35s infinite}.openpen-line-t3{animation:openpen-line-tick 1.4s ease-in-out -.6s infinite}</style>' +
    '<path d="M 2 22 L 1 21 L 19 3 L 20 4 Z" fill="#ffffff" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M 2 22 L 1 21 L 19 3 L 20 4 Z" fill="#fafafa" stroke="#111111" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<line class="openpen-line-t1" x1="6.5" y1="17.5" x2="6" y2="17" stroke="#111111" stroke-width="1" stroke-linecap="round"/>' +
    '<line class="openpen-line-t2" x1="11" y1="13" x2="10.5" y2="12.5" stroke="#111111" stroke-width="1" stroke-linecap="round"/>' +
    '<line class="openpen-line-t3" x1="15.5" y1="8.5" x2="15" y2="8" stroke="#111111" stroke-width="1" stroke-linecap="round"/>' +
    '<line class="openpen-line-edge" x1="2" y1="22" x2="20" y2="4" stroke="var(--openpen-cursor-accent, #818cf8)" stroke-width="1.6" stroke-linecap="round"/>' +
    '<circle cx="2" cy="22" r="1.1" fill="#111111"/>' +
    '<circle class="openpen-line-tracer" cx="5" cy="19" r="2.6" fill="#ffffff" opacity="0.85"/>' +
    '<circle class="openpen-line-tracer" cx="5" cy="19" r="2" fill="var(--openpen-cursor-accent, #818cf8)"/>' +
    '</svg>',
  hotspot: { x: 2, y: 22 },
  fallback: 'crosshair',
}