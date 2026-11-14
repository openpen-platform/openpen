import { i18n } from '../i18n/index';
import { pushNotification, isHostNotifyEnabled } from './notification-service';

const PEN_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
const STOP_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';

/**
 * Push the host toast for a drawing-mode change. Gated by the
 * notifyOnDrawingMode setting. Shown by whichever window hosts the toast
 * layer for this platform (see App.vue).
 */
export function notifyDrawingMode(enabled: boolean): void {
  if (!isHostNotifyEnabled()) return;
  const t = i18n.global.t;
  if (enabled) {
    pushNotification(
      { message: t('drawingModeOn'), description: t('drawingModeOnSub'), icon: PEN_ICON_SVG, variant: 'warning' },
      { source: 'host' },
    );
  } else {
    pushNotification(
      { message: t('drawingModeOff'), description: t('drawingModeOffSub'), icon: STOP_ICON_SVG, variant: 'default' },
      { source: 'host' },
    );
  }
}
