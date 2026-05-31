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

/** A serialisable snapshot of the full drawing (strokes + undo/redo stacks). */
export interface DrawingSnapshot {
  strokes: Stroke[]
  undoStack: Command[]
  redoStack: Command[]
}

/** Capture the current strokes + history as a plain, JSON-serialisable snapshot. */
export function serializeState(): DrawingSnapshot {
  return { strokes, undoStack, redoStack }
}

/**
 * Replace the store with a snapshot, WITHOUT generating new history commands.
 * Used on Wayland to restore the canvas after the overlay window is recreated
 * (the renderer's in-memory store is lost when the window is destroyed; the
 * main process holds the snapshot and replays it here).
 */
export function hydrateState(snapshot: DrawingSnapshot): void {
  strokes = Array.isArray(snapshot.strokes) ? [...snapshot.strokes] : []
  undoStack = Array.isArray(snapshot.undoStack) ? [...snapshot.undoStack] : []
  redoStack = Array.isArray(snapshot.redoStack) ? [...snapshot.redoStack] : []
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
