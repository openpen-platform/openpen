import type { SvgCursorSpec } from '@openpen/module-api'

/**
 * OpenPen cursor — eraser
 * Variant: Block eraser
 *
 * A classic two-tone block eraser, tilted around the active corner. As it
 * shakes, dust particles fly off the corner and fade.
 *
 * Tunable parameters (baked into the SVG strings below).
 * To iterate: share this block with Claude Code and ask for a delta,
 * or hand-edit the corresponding values in the SVG / @keyframes / @style.
 *
 *   accent         : '#818cf8'    Accent (unused for dust)
 *   dustColor      : '#666666'    Dust color
 *   dustCount      : 5            Dust particles  (1..6, step 1)
 *   dustSizeMin    : 1            Dust size min  (0.3..4.8, step 0.05)
 *   dustSizeMax    : 3            Dust size max  (0.3..4.8, step 0.05)
 *   dustDistance   : 16           Dust travel  (2..21, step 0.25)
 *   shakeAmplitude : 5            Body shake (°)  (0..10, step 0.5)
 *   duration       : 1            Loop · seconds  (0.8..2, step 0.1)
 *
 * PARAMS_JSON: {"accent":"#818cf8","dustColor":"#666666","dustCount":5,"dustSizeMin":1,"dustSizeMax":3,"dustDistance":16,"shakeAmplitude":5,"duration":1}
 *
 * Hotspot: { x: 2, y: 22 }
 */

export const eraserCursor: SvgCursorSpec = {
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">' +
    '<g transform="rotate(-8 2 22)">' +
    '<rect x="2" y="13" width="19" height="9" rx="1.5" ry="1.5" fill="#ffffff" stroke="#ffffff" stroke-width="3"/>' +
    '<rect x="2" y="13" width="19" height="9" rx="1.5" ry="1.5" fill="#fafafa" stroke="#111111" stroke-width="1.4"/>' +
    '<line x1="3" y1="17.2" x2="20" y2="17.2" stroke="#111111" stroke-width="1.2"/>' +
    '<rect x="2.7" y="17.7" width="17.6" height="3.7" rx="1.2" fill="#111111" fill-opacity="0.07"/>' +
    '</g>' +
    '</svg>',
  hotspot: { x: 2, y: 22 },
  fallback: 'crosshair',
}

export const eraserCursorAnimated: SvgCursorSpec = {
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" overflow="visible">' +
    '<style>@keyframes openpen-eraser-shake{0%,100%{transform:rotate(-10.5deg)}50%{transform:rotate(-5.5deg)}}.openpen-eraser-body{transform-origin:2px 22px;animation:openpen-eraser-shake 1s ease-in-out infinite}@keyframes openpen-eraser-d0{0%{transform:translate(0,0) scale(0.6);opacity:0}25%{opacity:1;transform:translate(-3.759px,-1.368px) scale(1)}100%{transform:translate(-15.035px,-5.472px) scale(0.7);opacity:0}}.openpen-eraser-d0{animation:openpen-eraser-d0 1.1s ease-out 0s infinite}@keyframes openpen-eraser-d1{0%{transform:translate(0,0) scale(0.6);opacity:0}25%{opacity:1;transform:translate(-3.373px,-2.149px) scale(1)}100%{transform:translate(-13.494px,-8.597px) scale(0.7);opacity:0}}.openpen-eraser-d1{animation:openpen-eraser-d1 1.1s ease-out -0.22s infinite}@keyframes openpen-eraser-d2{0%{transform:translate(0,0) scale(0.6);opacity:0}25%{opacity:1;transform:translate(-2.829px,-2.829px) scale(1)}100%{transform:translate(-11.314px,-11.314px) scale(0.7);opacity:0}}.openpen-eraser-d2{animation:openpen-eraser-d2 1.1s ease-out -0.44s infinite}@keyframes openpen-eraser-d3{0%{transform:translate(0,0) scale(0.6);opacity:0}25%{opacity:1;transform:translate(-2.149px,-3.373px) scale(1)}100%{transform:translate(-8.597px,-13.494px) scale(0.7);opacity:0}}.openpen-eraser-d3{animation:openpen-eraser-d3 1.1s ease-out -0.66s infinite}@keyframes openpen-eraser-d4{0%{transform:translate(0,0) scale(0.6);opacity:0}25%{opacity:1;transform:translate(-1.368px,-3.759px) scale(1)}100%{transform:translate(-5.472px,-15.035px) scale(0.7);opacity:0}}.openpen-eraser-d4{animation:openpen-eraser-d4 1.1s ease-out -0.88s infinite}</style>' +
    '<g class="openpen-eraser-body">' +
    '<rect x="2" y="13" width="19" height="9" rx="1.5" ry="1.5" fill="#ffffff" stroke="#ffffff" stroke-width="3"/>' +
    '<rect x="2" y="13" width="19" height="9" rx="1.5" ry="1.5" fill="#fafafa" stroke="#111111" stroke-width="1.4"/>' +
    '<line x1="3" y1="17.2" x2="20" y2="17.2" stroke="#111111" stroke-width="1.2"/>' +
    '<rect x="2.7" y="17.7" width="17.6" height="3.7" rx="1.2" fill="#111111" fill-opacity="0.07"/>' +
    '</g>' +
    '<circle class="openpen-eraser-d0" cx="1.6" cy="22" r="2.312" fill="#666666" stroke="#ffffff" stroke-width="0.5"/>' +
    '<circle class="openpen-eraser-d1" cx="2" cy="22.25" r="2.91" fill="#666666" stroke="#ffffff" stroke-width="0.5"/>' +
    '<circle class="openpen-eraser-d2" cx="1.6" cy="22.5" r="1.998" fill="#666666" stroke="#ffffff" stroke-width="0.5"/>' +
    '<circle class="openpen-eraser-d3" cx="2" cy="22" r="1.782" fill="#666666" stroke="#ffffff" stroke-width="0.5"/>' +
    '<circle class="openpen-eraser-d4" cx="1.6" cy="22.25" r="1.945" fill="#666666" stroke="#ffffff" stroke-width="0.5"/>' +
    '</svg>',
  hotspot: { x: 2, y: 22 },
  fallback: 'crosshair',
}