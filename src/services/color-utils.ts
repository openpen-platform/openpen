import type { StrokeColor } from '../types/tool-types'

export function resolveColorStyle(
  ctx: CanvasRenderingContext2D,
  color: StrokeColor,
  startPoint: { x: number; y: number },
  endPoint: { x: number; y: number }
): string | CanvasGradient {
  if (typeof color !== 'object' || color === null || color.type !== 'linear') {
    return color as string
  }
  // Degenerate gradient (identical endpoints) — fall back to the start color.
  if (startPoint.x === endPoint.x && startPoint.y === endPoint.y) return color.from

  const gradient = ctx.createLinearGradient(startPoint.x, startPoint.y, endPoint.x, endPoint.y)
  gradient.addColorStop(0, color.from)
  gradient.addColorStop(1, color.to)
  return gradient
}

export function hexToRgb(hex: string): [number, number, number] {
  const normalizedHex = hex.replace('#', '')
  return [
    parseInt(normalizedHex.slice(0, 2), 16),
    parseInt(normalizedHex.slice(2, 4), 16),
    parseInt(normalizedHex.slice(4, 6), 16),
  ]
}

export function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((channelValue) =>
        Math.round(Math.max(0, Math.min(255, channelValue))).toString(16).padStart(2, '0'))
      .join('')
  )
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const saturationRatio = s / 100
  const valueRatio = v / 100
  const resolveChannel = (channelOffset: number, sector = (channelOffset + h / 60) % 6) =>
    valueRatio - valueRatio * saturationRatio * Math.max(Math.min(sector, 4 - sector, 1), 0)

  return [
    Math.round(resolveChannel(5) * 255),
    Math.round(resolveChannel(3) * 255),
    Math.round(resolveChannel(1) * 255),
  ]
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const maxChannel = Math.max(r, g, b)
  const minChannel = Math.min(r, g, b)
  const delta = maxChannel - minChannel

  let h = 0
  if (delta !== 0) {
    if (maxChannel === r) h = ((g - b) / delta + 6) % 6
    else if (maxChannel === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
    h *= 60
  }
  const s = maxChannel === 0 ? 0 : (delta / maxChannel) * 100
  const valuePercent = maxChannel * 100
  return [h, s, valuePercent]
}

export function hexToHsv(hex: string): [number, number, number] {
  return rgbToHsv(...hexToRgb(hex))
}

export function hsvToHex(h: number, s: number, v: number): string {
  return rgbToHex(...hsvToRgb(h, s, v))
}

export function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex)
}
