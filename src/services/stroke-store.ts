import type { Stroke } from '../types/tool-types'

type AddStrokeCommand = { type: 'ADD_STROKE'; stroke: Stroke }
type RemoveStrokeCommand = { type: 'REMOVE_STROKE'; stroke: Stroke }
type ClearAllCommand = { type: 'CLEAR_ALL'; strokes: Stroke[] }
type Command = AddStrokeCommand | RemoveStrokeCommand | ClearAllCommand

let strokes: Stroke[] = []

const HISTORY_LIMIT = 50
let undoStack: Command[] = []
let redoStack: Command[] = []

export function addStroke(stroke: Stroke): void {
  strokes.push(stroke)
}

export function getAllStrokes(): Stroke[] {
  return strokes
}

export function clearAll(): void {
  strokes = []
}

export function removeStrokeById(id: string): boolean {
  const idx = strokes.findIndex((s) => s.id === id)
  if (idx === -1) return false
  strokes.splice(idx, 1)
  return true
}

// ── Undo / Redo History ───────────────────────────────────────────────────────

/** Record an undoable command and clear the redo stack. Drops the oldest entry once HISTORY_LIMIT is exceeded. */
export function pushCommand(command: Command): void {
  undoStack.push(command)
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift()
  redoStack = []
}

export function undo(): boolean {
  const command = undoStack.pop()
  if (!command) return false
  applyUndo(command)
  redoStack.push(command)
  return true
}

export function redo(): boolean {
  const command = redoStack.pop()
  if (!command) return false
  applyRedo(command)
  undoStack.push(command)
  return true
}

export function canUndo(): boolean {
  return undoStack.length > 0
}

export function canRedo(): boolean {
  return redoStack.length > 0
}

/** Reset the undo/redo history. Test-only. */
export function resetHistory(): void {
  undoStack = []
  redoStack = []
}

function applyUndo(command: Command): void {
  if (command.type === 'ADD_STROKE') {
    removeStrokeById(command.stroke.id)
  } else if (command.type === 'REMOVE_STROKE') {
    strokes.push(command.stroke)
  } else if (command.type === 'CLEAR_ALL') {
    strokes = [...command.strokes]
  }
}

function applyRedo(command: Command): void {
  if (command.type === 'ADD_STROKE') {
    strokes.push(command.stroke)
  } else if (command.type === 'REMOVE_STROKE') {
    removeStrokeById(command.stroke.id)
  } else if (command.type === 'CLEAR_ALL') {
    strokes = []
  }
}
