import { createApp } from 'vue'
import App from './App.vue'
import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import { i18n } from './i18n/index'
import { clickOutside } from './directives/clickOutside'
import { initAppConfig } from './services/config-bridge'
import './style.css'
import './styles/control-bar-items.css'
import '@openpen/module-api/uikit/tokens.css'

// Window-level uncaught errors → main-process log.
window.addEventListener('error', (event) => {
  window.openPenApi?.recordError({
    level: 'error',
    message: event.message,
    stack: event.error?.stack,
    source: event.filename,
    line: event.lineno,
    column: event.colno,
  })
})

// Unhandled promise rejections → main-process log.
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  window.openPenApi?.recordError({
    level: 'error',
    message: `unhandledrejection: ${reason?.message ?? reason}`,
    stack: reason?.stack,
  })
})

async function bootstrap(): Promise<void> {
  await initAppConfig()

  const app = createApp(App)

  // Vue component errors → main-process log.
  app.config.errorHandler = (err, _, info) => {
    const error = err as Error
    window.openPenApi?.recordError({
      level: 'error',
      message: `[Vue ${info}] ${error.message}`,
      stack: error.stack,
    })
    console.error('[Vue]', err, info)
  }

  app
    .use(i18n)
    .use(autoAnimatePlugin, { duration: 280, easing: 'ease-out' })
    .directive('click-outside', clickOutside)
    .mount('#app')
}

bootstrap()
