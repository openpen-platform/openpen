import type { SvgCursorSpec } from '@openpen/module-api'

/**
 * OpenPen cursor — freehand
 * Variant: Apple Pencil stylus
 *
 * Pointed writing tip at the hotspot; rounded dome at the back (convex).
 * Indigo ink bubbles rise from the tip along the pen body, plus a flow
 * shimmer along the shaft.
 *
 * Tunable parameters (baked into the SVG strings below).
 * To iterate: share this block with Claude Code and ask for a delta,
 * or hand-edit the corresponding values in the SVG / @keyframes / @style.
 *
 *   accent         : '#818cf8'    Accent color
 *   bubbleCount    : 6            Ink bubbles  (1..6, step 1)
 *   bubbleAngle    : 68           Bubble angle (° up)  (60..90, step 1)
 *   bubbleDistance : 20           Bubble travel  (3..42, step 0.5)
 *   bubbleSizeMin  : 1            Bubble size min  (0.2..4.2, step 0.05)
 *   bubbleSizeMax  : 5            Bubble size max  (0.2..4.2, step 0.05)
 *   duration       : 2            Loop · seconds  (0.8..3, step 0.1)
 *
 * PARAMS_JSON: {"accent":"#818cf8","bubbleCount":6,"bubbleAngle":68,"bubbleDistance":20,"bubbleSizeMin":1,"bubbleSizeMax":5,"duration":2}
 *
 * Hotspot: { x: 2, y: 22 }
 */

export const freehandCursor: SvgCursorSpec = {
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">' +
    '<path d="M 2 22 L 4 22 L 21 5 A 1.4 1.4 0 0 0 19 3 L 2 20 Z" stroke="#ffffff" stroke-width="3" stroke-linejoin="round" fill="#ffffff"/>' +
    '<path d="M 2 22 L 4 22 L 21 5 A 1.4 1.4 0 0 0 19 3 L 2 20 Z" fill="#fafafa" stroke="#111111" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<line x1="3.7" y1="18.3" x2="5.7" y2="20.3" stroke="#111111" stroke-width="1" stroke-linecap="round"/>' +
    '<circle cx="2.7" cy="21.3" r="0.55" fill="#111111"/>' +
    '</svg>',
  hotspot: { x: 2, y: 22 },
  fallback: 'crosshair',
}

export const freehandCursorAnimated: SvgCursorSpec = {
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" overflow="visible">' +
    '<style>@keyframes openpen-freehand-tip{0%,100%{transform:scale(1)}50%{transform:scale(1.5)}}@keyframes openpen-freehand-b0{0%{transform:translate(0,0) scale(0.4);opacity:0}15%{opacity:0.95;transform:translate(0.927px,-2.853px) scale(1)}100%{transform:translate(6.18px,-19.021px) scale(0.35);opacity:0}}.openpen-freehand-b0{animation:openpen-freehand-b0 2s ease-out 0s infinite}@keyframes openpen-freehand-b1{0%{transform:translate(0,0) scale(0.4);opacity:0}15%{opacity:0.95;transform:translate(1.408px,-2.649px) scale(1)}100%{transform:translate(9.389px,-17.659px) scale(0.35);opacity:0}}.openpen-freehand-b1{animation:openpen-freehand-b1 2s ease-out -0.333s infinite}@keyframes openpen-freehand-b2{0%{transform:translate(0,0) scale(0.4);opacity:0}15%{opacity:0.95;transform:translate(0.726px,-2.911px) scale(1)}100%{transform:translate(4.838px,-19.406px) scale(0.35);opacity:0}}.openpen-freehand-b2{animation:openpen-freehand-b2 2s ease-out -0.667s infinite}@keyframes openpen-freehand-b3{0%{transform:translate(0,0) scale(0.4);opacity:0}15%{opacity:0.95;transform:translate(1.315px,-2.696px) scale(1)}100%{transform:translate(8.767px,-17.976px) scale(0.35);opacity:0}}.openpen-freehand-b3{animation:openpen-freehand-b3 2s ease-out -1s infinite}@keyframes openpen-freehand-b4{0%{transform:translate(0,0) scale(0.4);opacity:0}15%{opacity:0.95;transform:translate(0.827px,-2.884px) scale(1)}100%{transform:translate(5.513px,-19.225px) scale(0.35);opacity:0}}.openpen-freehand-b4{animation:openpen-freehand-b4 2s ease-out -1.333s infinite}@keyframes openpen-freehand-b5{0%{transform:translate(0,0) scale(0.4);opacity:0}15%{opacity:0.95;transform:translate(1.5px,-2.598px) scale(1)}100%{transform:translate(10px,-17.321px) scale(0.35);opacity:0}}.openpen-freehand-b5{animation:openpen-freehand-b5 2s ease-out -1.667s infinite}.openpen-freehand-tip{transform-origin:2.7px 21.3px;animation:openpen-freehand-tip 2s ease-in-out infinite}</style>' +
    '<path d="M 2 22 L 4 22 L 21 5 A 1.4 1.4 0 0 0 19 3 L 2 20 Z" stroke="#ffffff" stroke-width="3" stroke-linejoin="round" fill="#ffffff"/>' +
    '<path d="M 2 22 L 4 22 L 21 5 A 1.4 1.4 0 0 0 19 3 L 2 20 Z" fill="#fafafa" stroke="#111111" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<line x1="3.7" y1="18.3" x2="5.7" y2="20.3" stroke="#111111" stroke-width="1" stroke-linecap="round"/>' +
    '<circle class="openpen-freehand-b0" cx="2" cy="22" r="1.830" fill="#ffffff" opacity="0.7"/>' +
    '<circle class="openpen-freehand-b0" cx="2" cy="22" r="1.430" fill="var(--openpen-cursor-accent, #818cf8)"/>' +
    '<circle class="openpen-freehand-b1" cx="2" cy="22" r="5.018" fill="#ffffff" opacity="0.7"/>' +
    '<circle class="openpen-freehand-b1" cx="2" cy="22" r="4.618" fill="var(--openpen-cursor-accent, #818cf8)"/>' +
    '<circle class="openpen-freehand-b2" cx="2" cy="22" r="3.566" fill="#ffffff" opacity="0.7"/>' +
    '<circle class="openpen-freehand-b2" cx="2" cy="22" r="3.166" fill="var(--openpen-cursor-accent, #818cf8)"/>' +
    '<circle class="openpen-freehand-b3" cx="2" cy="22" r="4.564" fill="#ffffff" opacity="0.7"/>' +
    '<circle class="openpen-freehand-b3" cx="2" cy="22" r="4.164" fill="var(--openpen-cursor-accent, #818cf8)"/>' +
    '<circle class="openpen-freehand-b4" cx="2" cy="22" r="2.916" fill="#ffffff" opacity="0.7"/>' +
    '<circle class="openpen-freehand-b4" cx="2" cy="22" r="2.516" fill="var(--openpen-cursor-accent, #818cf8)"/>' +
    '<circle class="openpen-freehand-b5" cx="2" cy="22" r="4.384" fill="#ffffff" opacity="0.7"/>' +
    '<circle class="openpen-freehand-b5" cx="2" cy="22" r="3.984" fill="var(--openpen-cursor-accent, #818cf8)"/>' +
    '<circle class="openpen-freehand-tip" cx="2.7" cy="21.3" r="0.55" fill="#111111"/>' +
    '</svg>',
  hotspot: { x: 2, y: 22 },
  fallback: 'crosshair',
}