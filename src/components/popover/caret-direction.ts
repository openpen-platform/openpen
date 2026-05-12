type Placement = 'below' | 'above' | 'left' | 'right'
type CaretDir = 'down' | 'up' | 'left' | 'right'

export function resolvePopupCaretDirection(mode: 'directional' | 'down', placement: Placement): CaretDir {
  if (mode === 'down') return 'down'
  if (placement === 'right') return 'right'
  if (placement === 'left') return 'left'
  if (placement === 'above') return 'up'
  return 'down'
}
