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

  // CI regression (run 31330358840): `data-all-icons-drawn` is vacuously "true"
  // on paints whose build predates the export scene's content — no node with a
  // pending icon has been seen, so nothing held the flag down. A poll landing on
  // such a frame approved a background-only capture and, by resolving true, made
  // the caller skip its recapture: the blank preview stuck permanently. With
  // `minNodesDrawn`, "ready" additionally requires the build to have included
  // the expected nodes.
  describe('minNodesDrawn (vacuous-readiness guard)', () => {
    it('does NOT resolve on a vacuously-ready canvas that has drawn no nodes', async () => {
      const canvas = drawnCanvas(); // allIconsDrawn="true", data-nodes-drawn absent
      let settled: boolean | 'pending' = 'pending';
      void waitForIconsDrawn(containerWith(canvas), 1000, 1).then((v) => {
        settled = v;
      });

      frame(); // the buggy predicate resolved true right here
      await Promise.resolve();
      expect(settled).toBe('pending');

      canvas.dataset.nodesDrawn = '0'; // an explicit empty build is just as vacuous
      frame();
      await Promise.resolve();
      expect(settled).toBe('pending');
    });

    it('resolves true once the build has drawn the expected nodes', async () => {
      const canvas = drawnCanvas();
      const result = waitForIconsDrawn(containerWith(canvas), 1000, 1);

      frame(); // vacuous frame — must not settle
      canvas.dataset.nodesDrawn = '1'; // content build lands
      frame();

      await expect(result).resolves.toBe(true);
    });

    it('resolves false on timeout while nodes never draw (recapture then replaces the frame)', async () => {
      const canvas = drawnCanvas();
      canvas.dataset.nodesDrawn = '0';
      const result = waitForIconsDrawn(containerWith(canvas), 50, 1);
      frame(100);
      await expect(result).resolves.toBe(false);
    });

    it('minNodesDrawn of 0 (the default) keeps the icons-only predicate', async () => {
      const canvas = drawnCanvas();
      canvas.dataset.nodesDrawn = '0';
      const result = waitForIconsDrawn(containerWith(canvas), 1000, 0);
      frame();
      await expect(result).resolves.toBe(true);
    });
  });
});
