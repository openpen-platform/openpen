/**
 * The five accent colours shared by the built-in colour module's default-colour
 * setting and the Appearance tab's accent colour setting. One list, one place.
 */
export interface AccentPreset {
  id: string
  label: string
  value: string
  /** Swatch fill used by both settings screens. */
  gradient: string
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'indigo', label: 'Indigo', gradient: 'linear-gradient(135deg,#818CF8,#6366F1)', value: '#818CF8' },
  { id: 'red',    label: 'Red',    gradient: 'linear-gradient(135deg,#F87171,#EF4444)', value: '#EF4444' },
  { id: 'green',  label: 'Emerald', gradient: 'linear-gradient(135deg,#34D399,#10B981)', value: '#10B981' },
  { id: 'blue',   label: 'Blue',   gradient: 'linear-gradient(135deg,#60A5FA,#3B82F6)', value: '#3B82F6' },
  { id: 'amber',  label: 'Amber',  gradient: 'linear-gradient(135deg,#FBBF24,#F59E0B)', value: '#F59E0B' },
]
