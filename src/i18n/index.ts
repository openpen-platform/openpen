import { createI18n } from 'vue-i18n'
import zhHant from './zh-Hant'
import en from './en'
import zhHans from './zh-Hans'
import ja from './ja'

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en, 'zh-Hans': zhHans, 'zh-Hant': zhHant, ja },
})

type SupportedLocale = 'en' | 'zh-Hans' | 'zh-Hant' | 'ja'
export const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'zh-Hant', 'zh-Hans', 'ja']

export function setLanguage(lang: string): void {
  if ((SUPPORTED_LOCALES as string[]).includes(lang)) {
    i18n.global.locale.value = lang as SupportedLocale
  }
}
