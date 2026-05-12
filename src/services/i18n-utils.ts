/** Resolve a plugin label — accepts a plain string or a LocaleMap. */
export function resolveLabel(labelsOrString: string | Record<string, string>, locale: string): string {
  if (typeof labelsOrString === 'string') return labelsOrString
  if (!labelsOrString || typeof labelsOrString !== 'object') return ''
  return (
    labelsOrString[locale] ??
    labelsOrString[locale.split('-')[0]] ??
    labelsOrString.en ??
    Object.values(labelsOrString)[0] ??
    ''
  )
}
