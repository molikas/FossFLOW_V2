import { waitForIconsDrawn } from '../waitForIconsDrawn';

// QA #10: the export must wait for the hidden Axoview's SceneCanvas to mount AND
// finish painting before capturing. The original poll treated an absent canvas
// as "nothing to wait for" and resolved true immediately — so on a slower mount
// it captured a blank frame and (because it returned true) the caller skipped
// its recapture, dropping every icon. These drive rAF + performance.now
// deterministically to lock the corrected behaviour.
describe('waitForIconsDrawn (QA #10)', () => {
  let now = 0;
  let queue: FrameRequestCallback[] = [];

  beforeEach(() => {
    now = 0;
    queue = [];
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        queue.push(cb);
        return queue.length;
      });
  });

  afterEach(() => jest.restoreAllMocks());

  // Advance one animation frame: bump the clock, then flush queued callbacks.
  const frame = (deltaMs = 16) => {
    now += deltaMs;
    const pending = queue;
    queue = [];
    pending.forEach((cb) => cb(now));
  };

  const containerWith = (canvas: HTMLElement | null): HTMLElement =>
    ({ querySelector: () => canvas }) as unknown as HTMLElement;

  const drawnCanvas = (): HTMLElement => {
    const el = document.createElement('div');
    el.dataset.allIconsDrawn = 'true';
    return el;
  };

  it('does NOT resolve while the canvas is absent (the regression)', async () => {
    let settled: boolean | 'pending' = 'pending';
    void waitForIconsDrawn(containerWith(null), 1000).then((v) => {
      settled = v;
    });

    frame(); // canvas still absent — the buggy poll resolved true right here
    await Promise.resolve();
    expect(settled).toBe('pending');

    frame();
    await Promise.resolve();
    expect(settled).toBe('pending');
  });

  it('resolves true once the canvas mounts and reports all icons drawn', async () => {
    let canvas: HTMLElement | null = null;
    const container = {
      querySelector: () => canvas
    } as unknown as HTMLElement;

    const result = waitForIconsDrawn(container, 1000);
    frame(); // absent → keep polling
    canvas = drawnCanvas(); // canvas mounts + reports ready
    frame();

    await expect(result).resolves.toBe(true);
  });

  it('resolves false on timeout when the canvas never draws (recapture is then triggered)', async () => {
    const result = waitForIconsDrawn(containerWith(null), 50);
    frame(100); // exceed the timeout with no canvas
    await expect(result).resolves.toBe(false);
  });

  it('resolves true immediately when the canvas is already drawn', async () => {
    const result = waitForIconsDrawn(containerWith(drawnCanvas()), 1000);
    frame();
    await expect(result).resolves.toBe(true);
  });
});
