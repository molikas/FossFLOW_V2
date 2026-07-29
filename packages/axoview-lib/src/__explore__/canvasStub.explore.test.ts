/**
 * Rig guard, not a hypothesis probe.
 *
 * jsdom has no canvas 2D context, so `getTextBoxDimensions` throws
 * "Could not get canvas context" and ANY text-box reducer call dies during
 * setup. That is a trap for this campaign specifically: an `it.failing` probe
 * whose body throws in setup reports as a confirmed bug. Two E1 probes were
 * briefly recorded on exactly that false evidence (2026-07-29) before this
 * guard existed.
 *
 * If this test goes red, every text-box probe's evidence is suspect.
 */
import { installCanvasStub } from './canvasStub';
import { getTextBoxDimensions } from 'src/utils';

describe('explore rig — canvas stub', () => {
  it('text measurement throws without the stub', () => {
    expect(() =>
      getTextBoxDimensions({
        id: 'tb',
        tile: { x: 0, y: 0 },
        content: 'hello world'
      } as never)
    ).toThrow(/canvas context/);
  });

  it('and returns a usable size once the stub is installed', () => {
    installCanvasStub();
    const size = getTextBoxDimensions({
      id: 'tb',
      tile: { x: 0, y: 0 },
      content: 'hello world'
    } as never);
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });
});
