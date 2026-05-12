/**
 * stroke-store unit tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  addStroke, getAllStrokes, clearAll, removeStrokeById,
  pushCommand, undo, redo, canUndo, canRedo, resetHistory,
} from '../../src/services/stroke-store';

/** @type {import('../../src/types/tool-types').Stroke} */
const MOCK_STROKE = {
  id: 'test-id-1',
  tool: 'freehand',
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  ],
  style: { color: '#ff0000', lineWidth: 4, lineCap: 'round', lineJoin: 'round' },
};

describe('stroke-store', () => {
  beforeEach(() => {
    clearAll();
    resetHistory();
  });

  it('initial state is an empty array', () => {
    expect(getAllStrokes()).toHaveLength(0);
  });

  it('addStroke + getAllStrokes returns one stroke', () => {
    addStroke(MOCK_STROKE);
    const strokes = getAllStrokes();
    expect(strokes).toHaveLength(1);
    expect(strokes[0]).toEqual(MOCK_STROKE);
  });

  it('multiple addStroke calls append in order', () => {
    addStroke({ ...MOCK_STROKE, id: 'a' });
    addStroke({ ...MOCK_STROKE, id: 'b' });
    const strokes = getAllStrokes();
    expect(strokes).toHaveLength(2);
    expect(strokes[0].id).toBe('a');
    expect(strokes[1].id).toBe('b');
  });

  it('clearAll leaves the store empty', () => {
    addStroke(MOCK_STROKE);
    clearAll();
    expect(getAllStrokes()).toHaveLength(0);
  });

  it('addStroke works again after clearAll', () => {
    addStroke(MOCK_STROKE);
    clearAll();
    addStroke({ ...MOCK_STROKE, id: 'new' });
    expect(getAllStrokes()).toHaveLength(1);
    expect(getAllStrokes()[0].id).toBe('new');
  });

  it('removeStrokeById returns true on hit and removes the stroke', () => {
    addStroke({ ...MOCK_STROKE, id: 'a' });
    addStroke({ ...MOCK_STROKE, id: 'b' });
    const removed = removeStrokeById('a');
    expect(removed).toBe(true);
    expect(getAllStrokes()).toHaveLength(1);
    expect(getAllStrokes()[0].id).toBe('b');
  });

  it('removeStrokeById returns false when the id is not found', () => {
    addStroke({ ...MOCK_STROKE, id: 'a' });
    const removed = removeStrokeById('missing');
    expect(removed).toBe(false);
    expect(getAllStrokes()).toHaveLength(1);
  });
});

// ── Undo / Redo history ──────────────────────────────────────────────────────

/** @returns {import('../../src/types/tool-types').Stroke} */
function makeStroke(id) {
  return {
    id,
    tool: 'freehand',
    points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    style: { color: '#ff0000', lineWidth: 4, lineCap: 'round', lineJoin: 'round' },
  };
}

describe('stroke-store — undo/redo history', () => {
  beforeEach(() => {
    clearAll();
    resetHistory();
  });

  it('canUndo / canRedo are both false initially', () => {
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);
  });

  it('pushCommand enables canUndo', () => {
    addStroke(makeStroke('s1'));
    pushCommand({ type: 'ADD_STROKE', stroke: makeStroke('s1') });
    expect(canUndo()).toBe(true);
  });

  it('pushCommand clears the redo stack', () => {
    addStroke(makeStroke('s1'));
    pushCommand({ type: 'ADD_STROKE', stroke: makeStroke('s1') });
    // Undo first to populate the redo stack; pushing a new command should clear it.
    undo();
    addStroke(makeStroke('s2'));
    pushCommand({ type: 'ADD_STROKE', stroke: makeStroke('s2') });
    expect(canRedo()).toBe(false);
  });

  it('undo ADD_STROKE removes the stroke from the store', () => {
    const s = makeStroke('s1');
    addStroke(s);
    pushCommand({ type: 'ADD_STROKE', stroke: s });

    const result = undo();
    expect(result).toBe(true);
    expect(getAllStrokes()).toHaveLength(0);
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(true);
  });

  it('redo ADD_STROKE re-adds the stroke', () => {
    const s = makeStroke('s1');
    addStroke(s);
    pushCommand({ type: 'ADD_STROKE', stroke: s });
    undo();

    const result = redo();
    expect(result).toBe(true);
    expect(getAllStrokes()).toHaveLength(1);
    expect(getAllStrokes()[0].id).toBe('s1');
    expect(canRedo()).toBe(false);
    expect(canUndo()).toBe(true);
  });

  it('undo REMOVE_STROKE restores the stroke', () => {
    const s = makeStroke('s1');
    addStroke(s);
    removeStrokeById('s1');
    pushCommand({ type: 'REMOVE_STROKE', stroke: s });

    undo();
    expect(getAllStrokes()).toHaveLength(1);
    expect(getAllStrokes()[0].id).toBe('s1');
  });

  it('redo REMOVE_STROKE removes the stroke again', () => {
    const s = makeStroke('s1');
    addStroke(s);
    removeStrokeById('s1');
    pushCommand({ type: 'REMOVE_STROKE', stroke: s });
    undo();

    redo();
    expect(getAllStrokes()).toHaveLength(0);
  });

  it('undo CLEAR_ALL restores every stroke', () => {
    const strokes = [makeStroke('a'), makeStroke('b'), makeStroke('c')];
    strokes.forEach(addStroke);
    pushCommand({ type: 'CLEAR_ALL', strokes: [...strokes] });
    clearAll();

    undo();
    expect(getAllStrokes()).toHaveLength(3);
    expect(getAllStrokes().map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('redo CLEAR_ALL empties the store again', () => {
    const strokes = [makeStroke('a'), makeStroke('b')];
    strokes.forEach(addStroke);
    pushCommand({ type: 'CLEAR_ALL', strokes: [...strokes] });
    clearAll();
    undo();

    redo();
    expect(getAllStrokes()).toHaveLength(0);
  });

  it('undo on empty stack returns false and leaves the store unchanged', () => {
    addStroke(makeStroke('s1'));
    const result = undo();
    expect(result).toBe(false);
    expect(getAllStrokes()).toHaveLength(1);
  });

  it('redo on empty stack returns false', () => {
    const result = redo();
    expect(result).toBe(false);
  });

  it('50-step cap: the oldest undo entry is dropped once the 51st is pushed', () => {
    for (let i = 0; i < 51; i++) {
      const s = makeStroke(`s${i}`);
      addStroke(s);
      pushCommand({ type: 'ADD_STROKE', stroke: s });
    }

    // 50 undos all succeed.
    for (let i = 0; i < 50; i++) {
      expect(undo()).toBe(true);
    }
    // The 51st fails — the oldest entry was shifted out.
    expect(undo()).toBe(false);
    expect(canUndo()).toBe(false);
  });

  it('new commands clear the redo stack', () => {
    const s1 = makeStroke('s1');
    addStroke(s1);
    pushCommand({ type: 'ADD_STROKE', stroke: s1 });
    undo(); // redo stack now has 1 entry

    expect(canRedo()).toBe(true);

    const s2 = makeStroke('s2');
    addStroke(s2);
    pushCommand({ type: 'ADD_STROKE', stroke: s2 }); // should clear redo

    expect(canRedo()).toBe(false);
  });

  it('chained undo then redo fully restores the store', () => {
    ['a', 'b', 'c'].forEach((id) => {
      const s = makeStroke(id);
      addStroke(s);
      pushCommand({ type: 'ADD_STROKE', stroke: s });
    });

    undo(); // remove c
    undo(); // remove b
    undo(); // remove a
    expect(getAllStrokes()).toHaveLength(0);

    redo(); // restore a
    redo(); // restore b
    redo(); // restore c
    expect(getAllStrokes()).toHaveLength(3);
  });
});
