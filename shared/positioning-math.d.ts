/**
 * Type declarations for shared/positioning-math.js.
 * This module is pure ESM with zero Electron / DOM / Vue imports.
 * Used by: main-process PositioningEngine, unit tests.
 */

export const BALL_HALF: number;

export function easeOutBack(t: number): number;

export interface DisplayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayLike {
  bounds: DisplayBounds;
  workArea: DisplayBounds;
  id?: number;
  scaleFactor?: number;
}

export interface BarBoundsLike {
  leftFromBall: number;
  rightFromBall: number;
  topFromBall: number;
  bottomFromBall: number;
}

export interface ClampResult {
  ballX: number;
  ballY: number;
  wasClamped: boolean;
  display: DisplayLike;
}

export interface SnapResult {
  edge: 'left' | 'right' | 'top' | 'bottom';
  snapBallX: number;
  snapBallY: number;
}

export function findDisplay(cx: number, cy: number, displays: DisplayLike[]): DisplayLike;

export function clampToWorkArea(
  ballX: number,
  ballY: number,
  displays: DisplayLike[],
  barBounds?: BarBoundsLike | null,
): ClampResult;

export function calcSnap(
  ballCenterX: number,
  ballCenterY: number,
  displays: DisplayLike[],
): SnapResult;
