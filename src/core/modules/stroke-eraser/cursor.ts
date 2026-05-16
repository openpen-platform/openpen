import type { SvgCursorSpec } from '@openpen/module-api'

/**
 * OpenPen cursor — stroke-eraser
 * Variant: Block eraser + sparkles
 *
 * Same body, size, tilt, and active corner as the brush block eraser — so
 * users perceive the two tools as the same eraser. Only the particle effect
 * (sparkle stars instead of dust) and the line color (red, customizable)
 * signal that this variant deletes the whole stroke rather than pixels.
 *
 * Tunable parameters (baked into the SVG strings below).
 * To iterate: share this block with Claude Code and ask for a delta,
 * or hand-edit the corresponding values in the SVG / @keyframes / @style.
 *
 *   lineColor      : '#dc2626'    Eraser line color
 *   accent         : '#818cf8'    Sparkle color
 *   sparkleCount   : 5            Sparkle count  (1..6, step 1)
 *   sparkleSizeMin : 1            Sparkle size min  (0.3..5.4, step 0.05)
 *   sparkleSizeMax : 4            Sparkle size max  (0.3..5.4, step 0.05)
 *   sparkleRadius  : 5            Sparkle orbit radius  (1.2..12, step 0.1)
 *   shakeAmplitude : 5            Body shake (°)  (0..10, step 0.5)
 *   duration       : 1            Loop · seconds  (0.8..2, step 0.1)
 *
 * PARAMS_JSON: {"lineColor":"#dc2626","accent":"#818cf8","sparkleCount":5,"sparkleSizeMin":1,"sparkleSizeMax":4,"sparkleRadius":5,"shakeAmplitude":5,"duration":1}
 *
 * Hotspot: { x: 2, y: 22 }
 */

export const strokeEraserCursor: SvgCursorSpec = {
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">' +
    '<g transform="rotate(-8 2 22)">' +
    '<rect x="2" y="13" width="19" height="9" rx="1.5" ry="1.5" fill="#ffffff" stroke="#ffffff" stroke-width="3"/>' +
    '<rect x="2" y="13" width="19" height="9" rx="1.5" ry="1.5" fill="#fafafa" stroke="#dc2626" stroke-width="1.4"/>' +
    '<line x1="3" y1="17.2" x2="20" y2="17.2" stroke="#dc2626" stroke-width="1.2"/>' +
    '<rect x="2.7" y="17.7" width="17.6" height="3.7" rx="1.2" fill="#dc2626" fill-opacity="0.10"/>' +
    '</g>' +
    '</svg>',
  hotspot: { x: 2, y: 22 },
  fallback: 'crosshair',
}

export const strokeEraserCursorAnimated: SvgCursorSpec = {
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" overflow="visible">' +
    '<style>@keyframes openpen-strokeeraser-bshake{0%,100%{transform:rotate(-10.5deg)}50%{transform:rotate(-5.5deg)}}.openpen-strokeeraser-bbody{transform-origin:2px 22px;animation:openpen-strokeeraser-bshake 1s ease-in-out infinite}@keyframes openpen-strokeeraser-bsp0{0%,100%{transform:scale(0);opacity:0}30%{transform:scale(1);opacity:1}55%{transform:scale(0.9);opacity:0.95}85%{transform:scale(0);opacity:0}}.openpen-strokeeraser-bsp0{transform-origin:6.924px 22.868px;animation:openpen-strokeeraser-bsp0 1s ease-in-out 0s infinite}@keyframes openpen-strokeeraser-bsp1{0%,100%{transform:scale(0);opacity:0}30%{transform:scale(1);opacity:1}55%{transform:scale(0.9);opacity:0.95}85%{transform:scale(0);opacity:0}}.openpen-strokeeraser-bsp1{transform-origin:6.217px 24.686px;animation:openpen-strokeeraser-bsp1 1s ease-in-out -0.2s infinite}@keyframes openpen-strokeeraser-bsp2{0%,100%{transform:scale(0);opacity:0}30%{transform:scale(1);opacity:1}55%{transform:scale(0.9);opacity:0.95}85%{transform:scale(0);opacity:0}}.openpen-strokeeraser-bsp2{transform-origin:4.868px 26.096px;animation:openpen-strokeeraser-bsp2 1s ease-in-out -0.4s infinite}@keyframes openpen-strokeeraser-bsp3{0%,100%{transform:scale(0);opacity:0}30%{transform:scale(1);opacity:1}55%{transform:scale(0.9);opacity:0.95}85%{transform:scale(0);opacity:0}}.openpen-strokeeraser-bsp3{transform-origin:3.082px 26.881px;animation:openpen-strokeeraser-bsp3 1s ease-in-out -0.6s infinite}@keyframes openpen-strokeeraser-bsp4{0%,100%{transform:scale(0);opacity:0}30%{transform:scale(1);opacity:1}55%{transform:scale(0.9);opacity:0.95}85%{transform:scale(0);opacity:0}}.openpen-strokeeraser-bsp4{transform-origin:1.132px 26.924px;animation:openpen-strokeeraser-bsp4 1s ease-in-out -0.8s infinite}</style>' +
    '<g class="openpen-strokeeraser-bbody">' +
    '<rect x="2" y="13" width="19" height="9" rx="1.5" ry="1.5" fill="#ffffff" stroke="#ffffff" stroke-width="3"/>' +
    '<rect x="2" y="13" width="19" height="9" rx="1.5" ry="1.5" fill="#fafafa" stroke="#dc2626" stroke-width="1.4"/>' +
    '<line x1="3" y1="17.2" x2="20" y2="17.2" stroke="#dc2626" stroke-width="1.2"/>' +
    '<rect x="2.7" y="17.7" width="17.6" height="3.7" rx="1.2" fill="#dc2626" fill-opacity="0.10"/>' +
    '</g>' +
    '<path class="openpen-strokeeraser-bsp0" d="M 6.924 20.897 L 7.37 22.422 L 8.895 22.868 L 7.37 23.314 L 6.924 24.839 L 6.478 23.314 L 4.953 22.868 L 6.478 22.422 Z" fill="#ffffff" opacity="0.75"/>' +
    '<path class="openpen-strokeeraser-bsp0" d="M 6.924 21.297 L 7.279 22.513 L 8.495 22.868 L 7.279 23.223 L 6.924 24.439 L 6.569 23.223 L 5.353 22.868 L 6.569 22.513 Z" fill="#818cf8"/>' +
    '<path class="openpen-strokeeraser-bsp1" d="M 6.217 22.079 L 6.807 24.096 L 8.824 24.686 L 6.807 25.276 L 6.217 27.294 L 5.627 25.276 L 3.61 24.686 L 5.627 24.096 Z" fill="#ffffff" opacity="0.75"/>' +
    '<path class="openpen-strokeeraser-bsp1" d="M 6.217 22.479 L 6.716 24.187 L 8.424 24.686 L 6.716 25.185 L 6.217 26.894 L 5.718 25.185 L 4.01 24.686 L 5.718 24.187 Z" fill="#818cf8"/>' +
    '<path class="openpen-strokeeraser-bsp2" d="M 4.868 22.609 L 5.657 25.307 L 8.354 26.096 L 5.657 26.885 L 4.868 29.582 L 4.079 26.885 L 1.382 26.096 L 4.079 25.307 Z" fill="#ffffff" opacity="0.75"/>' +
    '<path class="openpen-strokeeraser-bsp2" d="M 4.868 23.009 L 5.566 25.398 L 7.954 26.096 L 5.566 26.794 L 4.868 29.182 L 4.17 26.794 L 1.782 26.096 L 4.17 25.398 Z" fill="#818cf8"/>' +
    '<path class="openpen-strokeeraser-bsp3" d="M 3.082 25.265 L 3.448 26.515 L 4.699 26.881 L 3.448 27.247 L 3.082 28.498 L 2.716 27.247 L 1.465 26.881 L 2.716 26.515 Z" fill="#ffffff" opacity="0.75"/>' +
    '<path class="openpen-strokeeraser-bsp3" d="M 3.082 25.665 L 3.357 26.606 L 4.299 26.881 L 3.357 27.156 L 3.082 28.098 L 2.807 27.156 L 1.865 26.881 L 2.807 26.606 Z" fill="#818cf8"/>' +
    '<path class="openpen-strokeeraser-bsp4" d="M 1.132 22.704 L 2.087 25.969 L 5.352 26.924 L 2.087 27.879 L 1.132 31.145 L 0.177 27.879 L -3.088 26.924 L 0.177 25.969 Z" fill="#ffffff" opacity="0.75"/>' +
    '<path class="openpen-strokeeraser-bsp4" d="M 1.132 23.104 L 1.996 26.06 L 4.952 26.924 L 1.996 27.788 L 1.132 30.745 L 0.268 27.788 L -2.688 26.924 L 0.268 26.06 Z" fill="#818cf8"/>' +
    '</svg>',
  hotspot: { x: 2, y: 22 },
  fallback: 'crosshair',
}