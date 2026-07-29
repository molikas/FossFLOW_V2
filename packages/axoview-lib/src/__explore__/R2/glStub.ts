/**
 * A recording WebGL2 stub for area R2 (docs/exploratory/areas/R2-webgl-substrate.md).
 *
 * `glSpriteBatch.ts` has ZERO tests because jsdom has no WebGL2 — and the module
 * feature-checks `createVertexArray` / `vertexAttribDivisor` / `getParameter`
 * precisely so a jsdom stub falls back to `null`. That check is also the way IN:
 * a stub that provides those three (plus the calls the batch actually makes)
 * drives the REAL packer, the REAL UV math and the REAL staging buffer, and
 * records every texture upload and draw so a probe can assert on them.
 *
 * This is not a WebGL emulator. It records; it does not rasterise. Anything that
 * depends on actual pixels (blending, mip generation, shader output) belongs in
 * the e2e probes, where Chromium supplies a real context.
 *
 * Not a spec file — `jest.explore.config.js` only matches `*.explore.test.ts`.
 */

/**
 * jsdom's canvas has no 2D context, and the shared `canvasStub` only provides
 * `font` / `measureText` (it was written for text measurement). `createSpriteBatch`
 * rasterises its built-in dot and white texel through a real 2D context, so it
 * needs the drawing calls too — without them construction throws
 * `dctx.clearRect is not a function`, which under `it.failing` would read as a
 * confirmed bug. Install this in every R2 probe.
 */
let drawingStubInstalled = false;
export function installDrawing2DStub() {
  if (drawingStubInstalled) return;
  drawingStubInstalled = true;
  const noop = () => undefined;
  const proto = HTMLCanvasElement.prototype as unknown as {
    getContext: (id: string) => unknown;
  };
  proto.getContext = function getContext(contextId: string) {
    if (contextId !== '2d') return null;
    let font = '16px sans-serif';
    return {
      get font() {
        return font;
      },
      set font(next: string) {
        font = next;
      },
      measureText: (text: string) => {
        const px = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '16');
        return { width: text.length * px * 0.55 };
      },
      clearRect: noop,
      fillRect: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      arc: noop,
      fill: noop,
      stroke: noop,
      setTransform: noop,
      fillText: noop,
      save: noop,
      restore: noop,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      textAlign: 'left',
      textBaseline: 'top'
    };
  } as never;
}

export interface Upload {
  /** Slot origin in atlas texels. */
  x: number;
  y: number;
  /** Slot size, read back from the uploaded source. */
  w: number;
  h: number;
  /** Whatever was handed to texSubImage2D — the probe's identity handle. */
  source: unknown;
}

export interface GlRecorder {
  uploads: Upload[];
  /** Every `bufferData` payload length (floats). */
  bufferDataFloats: number[];
  /** Every `drawArraysInstanced` instance count. */
  draws: number[];
  /** The last instance staging payload, as a plain array of floats. */
  lastInstanceData: number[] | null;
  mipmapCount: number;
  /** Set when the batch asked for a shader/program status. */
  compiled: number;
  deleted: string[];
}

export interface StubOptions {
  /** Reported MAX_TEXTURE_SIZE (default 16384). */
  maxTextureSize?: number;
  /** Make shader compilation fail (drives the createSpriteBatch null path). */
  failCompile?: boolean;
  /** Make program linking fail. */
  failLink?: boolean;
}

/**
 * A canvas whose `getContext('webgl2')` hands back the recording stub, and whose
 * `getContext('2d')` hands back a minimal Canvas2D stub (the batch rasterises its
 * built-in dot and white texel through one). Returns the canvas plus the
 * recorder so a probe can read what the batch did.
 */
export const makeStubCanvas = (
  opts: StubOptions = {}
): { canvas: HTMLCanvasElement; rec: GlRecorder } => {
  const rec: GlRecorder = {
    uploads: [],
    bufferDataFloats: [],
    draws: [],
    lastInstanceData: null,
    mipmapCount: 0,
    compiled: 0,
    deleted: []
  };

  const noop = () => undefined;
  const obj = (tag: string) => ({ __tag: tag });

  const gl: Record<string, unknown> = {
    // --- enums the batch reads ---
    TEXTURE_2D: 0x0de1,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    LINEAR_MIPMAP_LINEAR: 0x2703,
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812f,
    MAX_TEXTURE_SIZE: 0x0d33,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    FLOAT: 0x1406,
    DYNAMIC_DRAW: 0x88e8,
    DEPTH_TEST: 0x0b71,
    BLEND: 0x0be2,
    ONE: 1,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    COLOR_BUFFER_BIT: 0x4000,
    TRIANGLES: 0x0004,
    TEXTURE0: 0x84c0,

    // --- the three the batch feature-checks ---
    createVertexArray: () => obj('vao'),
    vertexAttribDivisor: noop,
    getParameter: (p: number) =>
      p === 0x0d33 ? (opts.maxTextureSize ?? 16384) : 0,

    // --- shaders / program ---
    createShader: () => {
      rec.compiled += 1;
      return obj('shader');
    },
    shaderSource: noop,
    compileShader: noop,
    getShaderParameter: () => !opts.failCompile,
    getShaderInfoLog: () => 'stub compile failure',
    deleteShader: () => rec.deleted.push('shader'),
    createProgram: () => obj('program'),
    attachShader: noop,
    linkProgram: noop,
    getProgramParameter: () => !opts.failLink,
    getProgramInfoLog: () => 'stub link failure',
    getUniformLocation: (_p: unknown, name: string) => obj('uniform:' + name),
    useProgram: noop,
    deleteProgram: () => rec.deleted.push('program'),

    // --- texture / atlas ---
    createTexture: () => obj('texture'),
    bindTexture: noop,
    texImage2D: noop,
    texParameteri: noop,
    texParameterf: noop,
    pixelStorei: noop,
    getExtension: () => null,
    texSubImage2D: (
      _target: number,
      _level: number,
      x: number,
      y: number,
      _fmt: number,
      _type: number,
      src: { width?: number; height?: number }
    ) => {
      rec.uploads.push({
        x,
        y,
        w: src?.width ?? 0,
        h: src?.height ?? 0,
        source: src
      });
    },
    generateMipmap: () => {
      rec.mipmapCount += 1;
    },
    activeTexture: noop,
    deleteTexture: () => rec.deleted.push('texture'),

    // --- buffers / VAO ---
    createBuffer: () => obj('buffer'),
    bindBuffer: noop,
    bindVertexArray: noop,
    enableVertexAttribArray: noop,
    vertexAttribPointer: noop,
    bufferData: (_target: number, data: Float32Array) => {
      rec.bufferDataFloats.push(data.length);
      rec.lastInstanceData = Array.from(data);
    },
    deleteBuffer: () => rec.deleted.push('buffer'),
    deleteVertexArray: () => rec.deleted.push('vao'),

    // --- per-frame ---
    viewport: noop,
    clearColor: noop,
    clear: noop,
    disable: noop,
    enable: noop,
    blendFunc: noop,
    uniform1f: noop,
    uniform1i: noop,
    uniform2f: noop,
    uniform3f: noop,
    drawArraysInstanced: (_mode: number, _first: number, _count: number, inst: number) => {
      rec.draws.push(inst);
    }
  };

  // A Canvas2D stub good enough for the batch's built-in dot + white rasters.
  const ctx2d = {
    clearRect: noop,
    beginPath: noop,
    arc: noop,
    fill: noop,
    fillRect: noop,
    set fillStyle(_v: string) {}
  };

  const canvas = {
    width: 0,
    height: 0,
    getContext: (kind: string) => (kind === 'webgl2' ? gl : ctx2d)
  } as unknown as HTMLCanvasElement;

  return { canvas, rec };
};

/**
 * A stand-in for a chip canvas of a given size. `putCanvas`/`putImage` read only
 * `width`/`height` and hand the object straight to `texSubImage2D`, so the tag
 * makes each upload identifiable in `rec.uploads`.
 */
export const chip = (w: number, h: number, tag: string) =>
  ({ width: w, height: h, tag }) as unknown as HTMLCanvasElement;
