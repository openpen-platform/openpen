import { describe, expect, it } from 'vitest';
import { calculatePopupAnchor } from '../../src/composables/usePopupAnchor';

function makeRect({ top, left, width, height }) {
  return {
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

describe('calculatePopupAnchor', () => {
  const wrapperRect = makeRect({ top: 0, left: 0, width: 800, height: 800 });

  it('defaults to below placement for top/null snap and keeps an 8px gap', () => {
    const result = calculatePopupAnchor({
      triggerRect: makeRect({ top: 60, left: 380, width: 36, height: 36 }),
      wrapperRect,
      snapEdge: null,
      popupWidth: 160,
      popupHeight: 96,
      gap: 8,
    });

    expect(result.placement).toBe('below');
    expect(result.arrowDir).toBe('up');
    expect(result.popupStyle.top).toBe('104px');
    expect(result.popupStyle.left).toBe('318px');
    expect(result.arrowOffset).toBe('80px');
  });

  it('flips to above when snap=top has insufficient space below', () => {
    const result = calculatePopupAnchor({
      triggerRect: makeRect({ top: 740, left: 380, width: 36, height: 36 }),
      wrapperRect,
      snapEdge: 'top',
      popupWidth: 160,
      popupHeight: 96,
      gap: 8,
    });

    expect(result.placement).toBe('above');
    expect(result.arrowDir).toBe('down');
    expect(result.popupStyle.top).toBe('636px');
  });

  it('prefers above for snap=bottom and flips below when space above is insufficient', () => {
    const result = calculatePopupAnchor({
      triggerRect: makeRect({ top: 12, left: 380, width: 36, height: 36 }),
      wrapperRect,
      snapEdge: 'bottom',
      popupWidth: 160,
      popupHeight: 96,
      gap: 8,
    });

    expect(result.placement).toBe('below');
    expect(result.arrowDir).toBe('up');
    expect(result.popupStyle.top).toBe('56px');
  });

  it('uses fixed inward placement for snap-left and centers arrow on the trigger Y axis', () => {
    const result = calculatePopupAnchor({
      triggerRect: makeRect({ top: 220, left: 383, width: 34, height: 34 }),
      wrapperRect,
      snapEdge: 'left',
      popupWidth: 128,
      popupHeight: 96,
      gap: 8,
    });

    expect(result.placement).toBe('right');
    expect(result.arrowDir).toBe('left');
    expect(result.popupStyle.left).toBe('425px');
    expect(result.popupStyle.top).toBe('189px');
    expect(result.arrowOffset).toBe('48px');
  });

  it('uses right-first placement order for vertical mode (including snap-right)', () => {
    const result = calculatePopupAnchor({
      triggerRect: makeRect({ top: 220, left: 383, width: 34, height: 34 }),
      wrapperRect,
      snapEdge: 'right',
      popupWidth: 128,
      popupHeight: 96,
      gap: 8,
    });

    expect(result.placement).toBe('right');
    expect(result.arrowDir).toBe('left');
    expect(result.popupStyle.left).toBe('425px');
    expect(result.popupStyle.top).toBe('189px');
    expect(result.arrowOffset).toBe('48px');
  });

  it('clamps horizontal placement inside the wrapper and repositions the arrow offset', () => {
    const result = calculatePopupAnchor({
      triggerRect: makeRect({ top: 60, left: 6, width: 36, height: 36 }),
      wrapperRect,
      snapEdge: null,
      popupWidth: 160,
      popupHeight: 96,
      gap: 8,
    });

    expect(result.popupStyle.left).toBe('8px');
    expect(result.arrowOffset).toBe('16px');
  });

  it('clamps vertical placement inside the wrapper and keeps the arrow inset safe', () => {
    const result = calculatePopupAnchor({
      triggerRect: makeRect({ top: 4, left: 383, width: 34, height: 34 }),
      wrapperRect,
      snapEdge: 'left',
      popupWidth: 128,
      popupHeight: 96,
      gap: 8,
    });

    expect(result.popupStyle.top).toBe('8px');
    expect(result.arrowOffset).toBe('16px');
  });

  it('uses anchorRect for main-axis placement while keeping arrow centered on trigger', () => {
    const result = calculatePopupAnchor({
      triggerRect: makeRect({ top: 60, left: 380, width: 36, height: 36 }),
      anchorRect: makeRect({ top: 52, left: 290, width: 240, height: 52 }),
      wrapperRect,
      snapEdge: null,
      popupWidth: 160,
      popupHeight: 96,
      gap: 12,
    });

    expect(result.placement).toBe('below');
    expect(result.popupStyle.top).toBe('116px');
    expect(result.popupStyle.left).toBe('318px');
    expect(result.arrowOffset).toBe('80px');
  });

  it('uses the caller-provided gap value for placement fit checks', () => {
    const triggerRect = makeRect({ top: 648, left: 380, width: 36, height: 36 });
    const availableSpace = {
      below: 108,
      above: 640,
      right: 300,
      left: 300,
    };
    const withGap8 = calculatePopupAnchor({
      triggerRect,
      wrapperRect,
      snapEdge: null,
      popupWidth: 160,
      popupHeight: 96,
      gap: 8,
      availableSpace,
    });
    const withGap16 = calculatePopupAnchor({
      triggerRect,
      wrapperRect,
      snapEdge: null,
      popupWidth: 160,
      popupHeight: 96,
      gap: 16,
      availableSpace,
    });

    expect(withGap8.placement).toBe('below');
    expect(withGap16.placement).toBe('above');
  });
});
