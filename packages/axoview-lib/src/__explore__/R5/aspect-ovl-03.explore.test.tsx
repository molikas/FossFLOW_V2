/**
 * R5 / OVL-03 — `useImageAspect` is the ONLY source of the icon aspect ratio the
 * ADR-0044 selection outline and the hover outline size themselves from
 * (`NodeTransformControls`, `HoverOutline`). The GL layer derives its own from
 * `naturalHeight / naturalWidth` AFTER `decode()` resolves.
 *
 * The hook has no `onerror` handler and no decode gate, and it only writes the
 * module cache on a successful `onload`. So:
 *   • a url that fails to load leaves the aspect at 1 forever AND is retried on
 *     every mount (a cache MISS is not memoised — the opposite of R3/GPU-03,
 *     where a transient failure was cached as permanent);
 *   • until the load resolves the outline is drawn at aspect 1 while the icon it
 *     is supposed to trace is not square.
 *
 * jsdom's `Image` never loads anything on its own, so the probe drives
 * `onload` / `onerror` explicitly — which is exactly the point: it can assert
 * that there IS no error path to drive.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { useImageAspect } from 'src/hooks/useImageAspect';

/** Every Image constructed during a test, so the probe can resolve them. */
const created: Array<HTMLImageElement & { src: string }> = [];

const OriginalImage = global.Image;

beforeAll(() => {
  // A minimal Image stand-in: records itself and does nothing until the test
  // fires onload / onerror. jsdom's own Image never fires either for a data or
  // http url under jest, so this is the only way to exercise both branches.
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;
    private _src = '';
    set src(v: string) {
      this._src = v;
      created.push(this as unknown as HTMLImageElement & { src: string });
    }
    get src() {
      return this._src;
    }
  }
  (global as unknown as { Image: unknown }).Image = FakeImage;
});

afterAll(() => {
  (global as unknown as { Image: unknown }).Image = OriginalImage;
});

beforeEach(() => {
  created.length = 0;
});

const Probe = ({ url }: { url?: string }) => {
  const aspect = useImageAspect(url);
  return <span data-testid="aspect">{String(aspect)}</span>;
};

const readAspect = () => Number(screen.getByTestId('aspect').textContent);

/** Resolve the pending image as a successful load of a w x h bitmap. */
const succeed = (w: number, h: number) => {
  const img = created[created.length - 1];
  img.naturalWidth = w;
  img.naturalHeight = h;
  act(() => {
    img.onload?.();
  });
};

/** Fail the pending image the way a 404 / dead CDN does. */
const fail = () => {
  const img = created[created.length - 1];
  act(() => {
    img.onerror?.();
  });
};

describe('OVL-03 — useImageAspect has no failure path', () => {
  it('CONTROL: a successful load reports the real aspect and caches it', () => {
    const { unmount } = render(<Probe url="ok://tall.svg" />);
    expect(readAspect()).toBe(1); // before load
    succeed(100, 250);
    expect(readAspect()).toBe(2.5);
    unmount();

    // Second mount is served from the module cache with no new Image.
    const countBefore = created.length;
    render(<Probe url="ok://tall.svg" />);
    expect(readAspect()).toBe(2.5);
    expect(created.length).toBe(countBefore);
  });

  it('characterization: a FAILED load leaves the aspect at 1 and is never cached', () => {
    render(<Probe url="bad://missing-1.svg" />);
    expect(created.length).toBe(1);
    fail();
    // Nothing changed — there is no onerror handler to change it.
    expect(readAspect()).toBe(1);
  });

  it.failing('a failed url should be remembered, not re-fetched on every mount', () => {
    const { unmount } = render(<Probe url="bad://missing-2.svg" />);
    fail();
    unmount();
    const countBefore = created.length;
    render(<Probe url="bad://missing-2.svg" />);
    expect(created.length, 'no second fetch for a known-bad url').toBe(
      countBefore
    );
  });

  it('characterization: it re-fetches the broken url on EVERY mount', () => {
    const { unmount } = render(<Probe url="bad://missing-3.svg" />);
    fail();
    unmount();
    const countBefore = created.length;
    render(<Probe url="bad://missing-3.svg" />);
    expect(created.length).toBe(countBefore + 1);
  });

  it('characterization: the outline is drawn at aspect 1 for the whole load window', () => {
    // This is what the selection box / hover outline size themselves from while
    // the GL layer waits for decode() before drawing anything at all — so the
    // outline is square around an icon that is not.
    render(<Probe url="ok://wide.svg" />);
    expect(readAspect()).toBe(1);
    succeed(400, 100);
    expect(readAspect()).toBe(0.25);
  });

  it('characterization: a zero-width bitmap falls back to 1 rather than dividing by zero', () => {
    render(<Probe url="ok://empty.svg" />);
    succeed(0, 0);
    expect(readAspect()).toBe(1);
  });
});
