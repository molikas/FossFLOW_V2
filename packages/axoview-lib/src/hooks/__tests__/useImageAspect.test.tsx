/**
 * Promoted from the 2026-07 exploratory lane (R5/OVL-03).
 *
 * `useImageAspect` is the ONLY source of the icon aspect ratio the ADR 0044
 * selection outline and the hover outline size themselves from
 * (`NodeTransformControls`, `HoverOutline`); the GL layer derives its own from
 * `naturalHeight / naturalWidth` after `decode()` resolves. The hook had no
 * `onerror` handler and wrote its module cache only on a successful `onload`, so
 * a dead url was re-requested on every mount of every outline that named it — a
 * cache MISS was never memoised.
 *
 * jsdom's `Image` never loads anything on its own, so these tests drive `onload`
 * / `onerror` explicitly. That is what makes the failure path assertable at all.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { useImageAspect } from 'src/hooks/useImageAspect';

/**
 * The Image stand-in's shape. Deliberately NOT `HTMLImageElement`: the point of
 * the stub is that the test writes `naturalWidth`, which is readonly on the DOM
 * type, and calls `onload()` with no event.
 */
interface FakeImg {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  naturalWidth: number;
  naturalHeight: number;
  src: string;
}

/** Every Image constructed during a test, so a test can resolve them. */
const created: FakeImg[] = [];

const OriginalImage = global.Image;

beforeAll(() => {
  // A minimal Image stand-in: records itself and does nothing until the test
  // fires onload / onerror.
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;
    private _src = '';
    set src(v: string) {
      this._src = v;
      created.push(this as FakeImg);
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

describe('useImageAspect — the success path', () => {
  it('a successful load reports the real aspect and caches it', () => {
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

  it('the outline starts square and narrows once the bitmap resolves', () => {
    // This is what the selection box / hover outline size themselves from while
    // the GL layer waits for decode() before drawing anything at all.
    render(<Probe url="ok://wide.svg" />);
    expect(readAspect()).toBe(1);
    succeed(400, 100);
    expect(readAspect()).toBe(0.25);
  });

  it('a zero-width bitmap falls back to 1 rather than dividing by zero', () => {
    render(<Probe url="ok://empty.svg" />);
    succeed(0, 0);
    expect(readAspect()).toBe(1);
  });
});

describe('useImageAspect — the failure path (OVL-03)', () => {
  it('a failed load reports the square fallback', () => {
    render(<Probe url="bad://missing-1.svg" />);
    expect(created.length).toBe(1);
    fail();
    expect(readAspect()).toBe(1);
  });

  it('a failed url is remembered, not re-fetched on every mount', () => {
    const { unmount } = render(<Probe url="bad://missing-2.svg" />);
    fail();
    unmount();
    const countBefore = created.length;
    render(<Probe url="bad://missing-2.svg" />);
    expect(created.length).toBe(countBefore);
  });

  it('and the remembered failure still resolves to 1, not to undefined or NaN', () => {
    // The sentinel is a Symbol in the same Map as the numeric hits, so the read
    // path has to narrow it. A leaked Symbol would surface here as NaN.
    const { unmount } = render(<Probe url="bad://missing-3.svg" />);
    fail();
    unmount();
    render(<Probe url="bad://missing-3.svg" />);
    expect(readAspect()).toBe(1);
    expect(Number.isNaN(readAspect())).toBe(false);
  });

  it('a failure for one url does not poison a different one', () => {
    const first = render(<Probe url="bad://missing-4.svg" />);
    fail();
    first.unmount();
    render(<Probe url="ok://after-failure.svg" />);
    succeed(100, 200);
    expect(readAspect()).toBe(2);
  });
});
