/**
 * @openpen/module-api/host — Color Utilities
 *
 * Proxies color manipulation helpers through the host registry. These
 * helpers are pure functions (no host state), so a future refactor MAY
 * lift the implementations into this package itself; for now they flow
 * through injection for consistency with the rest of the host surface.
 */
import { _useHost } from './registry'
import type { ModuleHost } from './types'

type Utils = ModuleHost['colorUtils']

export const resolveColorStyle: Utils['resolveColorStyle'] = (ctx, color, startPoint, endPoint) =>
  _useHost().colorUtils.resolveColorStyle(ctx, color, startPoint, endPoint)

export const hexToRgb: Utils['hexToRgb'] = (hex) =>
  _useHost().colorUtils.hexToRgb(hex)

export const rgbToHex: Utils['rgbToHex'] = (r, g, b) =>
  _useHost().colorUtils.rgbToHex(r, g, b)

export const hsvToRgb: Utils['hsvToRgb'] = (h, s, v) =>
  _useHost().colorUtils.hsvToRgb(h, s, v)

export const rgbToHsv: Utils['rgbToHsv'] = (r, g, b) =>
  _useHost().colorUtils.rgbToHsv(r, g, b)

export const hexToHsv: Utils['hexToHsv'] = (hex) =>
  _useHost().colorUtils.hexToHsv(hex)

export const hsvToHex: Utils['hsvToHex'] = (h, s, v) =>
  _useHost().colorUtils.hsvToHex(h, s, v)

export const isValidHex: Utils['isValidHex'] = (hex) =>
  _useHost().colorUtils.isValidHex(hex)
