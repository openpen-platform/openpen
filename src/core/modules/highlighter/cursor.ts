import type { SvgCursorSpec } from '@openpen/module-api'

/**
 * OpenPen cursor — highlighter
 *
 * A chisel-tip marker pointing down-left; the translucent swatch at the tip
 * takes the user's accent colour. Hotspot is the bottom of the chisel tip.
 *
 * Hotspot: { x: 3, y: 21 }
 */
export const highlighterCursor: SvgCursorSpec = {
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">' +
    '<path d="M 3 21 L 3 17 L 15 5 L 19 9 L 7 21 Z" stroke="#ffffff" stroke-width="3" stroke-linejoin="round" fill="#ffffff"/>' +
    '<path d="M 15 5 L 18 2 L 22 6 L 19 9 Z" stroke="#ffffff" stroke-width="3" stroke-linejoin="round" fill="#ffffff"/>' +
    '<path d="M 3 21 L 3 17 L 15 5 L 19 9 L 7 21 Z" fill="#fafafa" stroke="#111111" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<path d="M 15 5 L 18 2 L 22 6 L 19 9 Z" fill="#fafafa" stroke="#111111" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<path d="M 3 21 L 3 17 L 7 21 Z" fill="var(--openpen-cursor-accent, #fde047)" fill-opacity="0.85" stroke="#111111" stroke-width="1" stroke-linejoin="round"/>' +
    '</svg>',
  hotspot: { x: 3, y: 21 },
  fallback: 'crosshair',
}
