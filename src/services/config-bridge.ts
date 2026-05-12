// eslint-disable-next-line @typescript-eslint/no-explicit-any
let appConfig: Record<string, any> = {}

/** Initialize the renderer-side app-config cache. Call before main.ts mounts. */
export async function initAppConfig(): Promise<void> {
  const api = window.openPenApi
  if (!api?.getAppConfig) return
  try {
    const fromMain = await api.getAppConfig()
    if (fromMain && typeof fromMain === 'object') {
      appConfig = fromMain
    }
  } catch (error: unknown) {
    console.warn('[AppConfig] Failed to fetch app config from main process:', (error as Error)?.message || error)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAppConfig(): Record<string, any> {
  return appConfig
}
