export type HoldKey =
  | 'Fn'
  | 'ControlLeft' | 'ControlRight'
  | 'AltLeft' | 'AltRight'
  | 'ShiftLeft' | 'ShiftRight'
  | 'MetaLeft' | 'MetaRight'

export declare const HOLD_KEYS: readonly HoldKey[]
export declare const HOLD_KEY_OFF: 'Off'
export declare const TYPING_TOOL_IDS: readonly string[]
export declare const HOLD_FALLBACK_TOOL_ID: string

export declare function defaultHoldKey(platform: string): HoldKey | null
export declare function isHoldKeyForPlatform(key: unknown, platform: string): key is HoldKey
export declare function resolveHoldKey(
  stored: string | null | undefined,
  platform: string,
  opts?: { fnReadable?: boolean },
): { key: HoldKey | null; fallback: boolean }
export declare function holdToDrawToolId<T extends string | null | undefined>(toolId: T): T | string
