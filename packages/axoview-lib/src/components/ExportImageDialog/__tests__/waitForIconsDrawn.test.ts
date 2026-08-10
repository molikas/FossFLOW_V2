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

  // A real <canvas> (jsdom default backing store 300×150): the predicate reads
  // `canvas.width/height` — a 1×1 buffer must not count as capturable.
  const drawnCanvas = (): HTMLCanvasElement => {
    const el = document.createElement('canvas');
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

  // CI regression, second round (PROBE10, run 31332531270): before the hidden
  // export container's ResizeObserver → rendererSize update lands, the canvas
  // backing store is 1×1 — and every dataset attribute can be HONESTLY true
  // about a paint into that one pixel (build=2, nodes=1, drawn=true was
  // measured). toDataURL on it serializes 142 bytes of nothing, which is the
  // deterministic blank CI preview. A degenerate buffer must not count as
  // capturable, however truthful its attributes.
  describe('backing-store guard (1×1 canvas)', () => {
    it('does NOT resolve while the backing store is 1×1, even with honest attributes', async () => {
      const canvas = drawnCanvas();
      canvas.width = 1;
      canvas.height = 1;
      canvas.dataset.nodesDrawn = '1';
      let settled: boolean | 'pending' = 'pending';
      void waitForIconsDrawn(containerWith(canvas), 1000, 1).then((v) => {
        settled = v;
      });

      frame(); // the round-1 predicate resolved true right here
      await Promise.resolve();
      expect(settled).toBe('pending');
    });

    it('resolves true once the buffer takes its real size', async () => {
      const canvas = drawnCanvas();
      canvas.width = 1;
      canvas.height = 1;
      canvas.dataset.nodesDrawn = '1';
      const result = waitForIconsDrawn(containerWith(canvas), 1000, 1);

      frame(); // degenerate frame — must not settle
      canvas.width = 849; // rendererSize lands, the paint resizes the store
      canvas.height = 491;
      frame();

      await expect(result).resolves.toBe(true);
    });

    it('resolves false on timeout while the buffer stays degenerate (recapture then replaces the frame)', async () => {
      const canvas = drawnCanvas();
      canvas.width = 1;
      canvas.height = 1;
      canvas.dataset.nodesDrawn = '1';
      const result = waitForIconsDrawn(containerWith(canvas), 50, 1);
      frame(100);
      await expect(result).resolves.toBe(false);
    });
  });
});
