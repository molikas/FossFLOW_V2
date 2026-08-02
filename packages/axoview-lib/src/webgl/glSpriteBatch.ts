// ---------------------------------------------------------------------------
// glSpriteBatch — instanced, single-atlas textured-quad renderer on WebGL2.
//
// The "heroic" GPU substrate: where the previous per-quad spike re-emitted every quad's
// device-space corners on the CPU and re-uploaded a vertex buffer every frame
// (and, because each chip is a unique content-keyed texture, flushed a draw
// call PER node), this batch:
//
//   1. Packs every icon + chip + the stalk dot into ONE mipmapped texture atlas.
//   2. Stores per-instance geometry in TILE (scene) space — the anchor, the two
//      local basis vectors (which bake the isometric shear), the atlas UV rect,
//      a tint, and a counter-scale flag — uploaded ONCE when the scene changes.
//   3. Computes each corner's screen position in the VERTEX SHADER from a single
//      view uniform (zoom·dpr, device origin) + the per-instance data. A base
//      unit quad comes from gl_VertexID, so no base-quad buffer is needed.
//
// Result: pan/zoom is one uniform write + one drawArraysInstanced call for the
// WHOLE layer, at any N. No per-node CPU work, no per-frame upload, one draw
// call — the property that lets the layer scale to tens of thousands of nodes.
//
// Coordinate model (identical to the previous per-quad spike):
//   device_px = (zoom · tilePoint + origin_css) · dpr
// so u_view = (zoom·dpr, origin_css_x·dpr, origin_css_y·dpr). tilePoint is the
// getTilePosition() output (independent of zoom/scroll — the whole point: only
// the uniform changes on navigation). The label counter-scale multiplies the
// LOCAL geometry (not the anchor), matching NodesCanvas exactly.
//
// WebGL2 is required (Phase C): createSpriteBatch returns null when it is
// unavailable, and the Renderer gates the whole canvas behind the
// WebGLUnsupportedScreen rather than any per-component Canvas2D fallback.
// ---------------------------------------------------------------------------

const VERT_SRC = `#version 300 es
layout(location=0) in vec4 i_anchorLocal; // (anchorX, anchorY, localOriginX, localOriginY)  tile space
layout(location=1) in vec4 i_basis;       // (ux, uy, vx, vy)  local edge vectors, tile space
layout(location=2) in vec4 i_uvRect;      // (u0, v0, uSize, vSize)  atlas coords
layout(location=3) in vec4 i_tint;        // (r, g, b, a)  colour multiply
layout(location=4) in vec4 i_misc;        // (counterScaleFlag, shapeMode, halfWidth, counterScale)
uniform vec2 u_resolution;   // device px
uniform vec3 u_view;         // (zoom*dpr, originX_dev, originY_dev)
uniform float u_counterScale;
out vec2 v_uv;
out vec4 v_tint;
// Analytic edge-AA carriers (§12). Only read when shapeMode>0 (line/disc); a
// textured sprite (mode 0) ignores them, so its output is unchanged.
out vec2 v_p;      // scene-space offset from the quad centre: (along, perpendicular)
out float v_hw;    // true stroke half-width (line) / disc radius, SCENE units
out float v_mode;  // 0 textured | 1 analytic line | 2 analytic disc
// Two triangles of a unit quad (TL,TR,BR / TL,BR,BL) — indexed by gl_VertexID.
const vec2 QUAD[6] = vec2[6](
  vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(1.0, 1.0),
  vec2(0.0, 0.0), vec2(1.0, 1.0), vec2(0.0, 1.0)
);
void main() {
  vec2 q = QUAD[gl_VertexID];
  // R5/OVL-02 — the counter-scale is PER INSTANCE (i_misc.w), not one uniform
  // for the whole draw. ADR 0015's floor is stated in terms of the label's own
  // on-screen font size, and per-label sizes (ADR 0032) make that per-label; a
  // single uniform could only ever be right for a default-sized label.
  // u_counterScale remains as the fallback for an instance that carries no
  // per-instance value (w <= 0), so an emitter that has not been migrated keeps
  // its previous behaviour rather than collapsing to 1.
  float perInstance = (i_misc.w > 0.0) ? i_misc.w : u_counterScale;
  float s = mix(1.0, perInstance, i_misc.x);
  vec2 local = (i_anchorLocal.zw + q.x * i_basis.xy + q.y * i_basis.zw) * s;
  vec2 tile = i_anchorLocal.xy + local;
  vec2 dev = vec2(u_view.x * tile.x + u_view.y, u_view.x * tile.y + u_view.z);
  vec2 clip = (dev / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = i_uvRect.xy + q * i_uvRect.zw;
  v_tint = i_tint;
  v_mode = i_misc.y;
  v_hw = i_misc.z;
  // Scene-space distance-field coordinate. A DISC (mode 2) needs both axes; a LINE
  // (mode 1) needs only the perpendicular (.y), so the along-axis is zeroed to keep
  // a long segment's length out of mediump. Scaled by s (the counter-scale mix) so
  // a counter-scaled instance's field tracks its drawn size (line/disc pass s==1).
  float along = (i_misc.y > 1.5) ? (q.x - 0.5) * length(i_basis.xy) : 0.0;
  float perp = (q.y - 0.5) * length(i_basis.zw);
  v_p = vec2(along, perp) * s;
}`;

const FRAG_SRC = `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec4 v_tint;
in vec2 v_p;
in float v_hw;
in float v_mode;
uniform sampler2D u_atlas;
out vec4 outColor;
void main() {
  // Premultiplied pipeline (atlas uploaded premultiplied): premultiply the tint's
  // alpha into its RGB so a translucent tint (halo, fillOpacity) blends correctly
  // AND a mip-minified edge doesn't pull the atlas's black transparent surround
  // into a dark/grey fringe — the "grey border around the dots / bubbly dash
  // caps" artifact. Un-fringed edges match the DOM's vector strokes.
  vec4 premTint = vec4(v_tint.rgb * v_tint.a, v_tint.a);
  // Textured-sprite path (chips, icons, arrow, ring) — UNCHANGED for mode 0.
  // Sampled UNCONDITIONALLY so texture derivatives stay valid at 2x2 quads that
  // straddle instances of different modes (the "texture in a branch" hazard).
  vec4 sprite = texture(u_atlas, v_uv) * premTint;
  // Analytic edge-AA (§12): distance-field coverage with a controlled ~1px SCREEN
  // feather via fwidth() — crisp at ANY zoom/shear, no texture, no MSAA needed.
  // Line = perpendicular distance |v_p.y|; disc = radial distance length(v_p).
  float d = (v_mode > 1.5) ? length(v_p) : abs(v_p.y);
  float aa = fwidth(d);
  float cov = clamp((v_hw - d) / max(aa, 1e-6) + 0.5, 0.0, 1.0);
  vec4 shape = premTint * cov; // premultiplied → blends under ONE / ONE_MINUS_SRC_ALPHA
  // Data select (not control flow) keeps the derivative ops above unconditional.
  outColor = (v_mode > 0.5) ? shape : sprite;
}`;

// 20 floats / instance = 5 vec4 attributes (80-byte stride, 16-byte aligned).
const FLOATS_PER_INSTANCE = 20;
const ATTR_STRIDE = FLOATS_PER_INSTANCE * 4;

// Cheap one-time WebGL2 capability probe. WebGL2 is the SOLE render substrate
// (ADR 0038): the Renderer calls this once and shows the WebGLUnsupportedScreen
// gate when it is false — there is no Canvas2D/DOM bulk fallback in any layer.
// Memoised (and the probe context is released below); safe to call every render.
// R2/GL-07: this NOTE used to read "strictly WEAKER than what createSpriteBatch
// needs … a browser that advertises WebGL2 but fails those can still slip past
// the gate — the layers surface that with a console.warn and a blank layer".
// That was the bug written down as a caveat. The gate builds a real batch now.
let _webgl2Supported: boolean | null = null;
export const isWebGL2Supported = (): boolean => {
  if (_webgl2Supported !== null) return _webgl2Supported;
  try {
    const c = document.createElement('canvas');
    // R2/GL-07: this gate used to check only that a `webgl2` context exists and
    // exposes `createVertexArray` — strictly WEAKER than what the layers
    // actually need. A context that passed it could still fail
    // `createSpriteBatch` on a shader compile or link, and the layer's response
    // was a `console.warn` and a return: the node layer rendered nothing,
    // permanently, with no retry and nothing user-visible, while
    // `WebGLUnsupportedScreen` had already been waved through. The diagram
    // simply appeared empty.
    //
    // The gate now attempts the real thing on a small atlas, so a substrate
    // failure routes to that screen instead of a blank canvas. It costs one
    // shader compile once per tab (the result is memoised for the tab's life)
    // and the probe context is released immediately either way.
    const batch = createSpriteBatch(c, 64);
    _webgl2Supported = batch !== null;
    batch?.destroy();
    // Release the probe's context immediately — otherwise it holds one of the
    // browser's ~16 live WebGL-context slots for the tab's life (each Renderer
    // opens 4, and image-export mounts a second Renderer), pushing a busy
    // session toward the cap where the oldest context gets force-lost.
    const gl = c.getContext('webgl2') as WebGL2RenderingContext | null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    _webgl2Supported = false;
  }
  return _webgl2Supported;
};

/** A packed sub-rectangle in the atlas, in normalised [0,1] texture coords. */
export interface UVRect {
  u0: number;
  v0: number;
  uS: number;
  vS: number;
}

// Half-texel UV inset for a packed (x,y,w,h) device-px slot in an `atlasSize`²
// atlas. LINEAR sampling at a sub-rect edge reaches HALF a texel past it; without
// the inset it pulls the neighbour's gutter in (the classic atlas seam), and at
// the atlas boundary it trims a chip's border asymmetrically (finding #2 — the
// partial grey chip border). Origin is nudged +½ texel and the span shrunk by a
// full texel, so both edges sample strictly INSIDE the slot. Sub-pixel at the
// supersampled chip resolution → visually lossless. Extracted (pure, no GL) so
// the inset math is unit-testable without a live context.
export const atlasUVRect = (
  x: number,
  y: number,
  w: number,
  h: number,
  atlasSize: number
): UVRect => ({
  u0: (x + 0.5) / atlasSize,
  v0: (y + 0.5) / atlasSize,
  uS: (w - 1) / atlasSize,
  vS: (h - 1) / atlasSize
});

export interface SpriteBatch {
  // --- atlas insertion (content-keyed; all pixels rasterised by Canvas2D) ---
  /** Pack an offscreen-canvas chip. `make` is lazy — only called on a miss. */
  putCanvas(
    key: string,
    version: number,
    make: () => HTMLCanvasElement
  ): UVRect | null;
  /** Pack a decoded icon image (downscaled to the atlas icon cap). */
  putImage(
    key: string,
    img: TexImageSource,
    w: number,
    h: number
  ): UVRect | null;
  /** The built-in filled-circle sub-rect (stalk dots + round line caps, tinted). */
  readonly dot: UVRect;
  /** A solid white texel (zero-size UV at its centre) for tinted solid quads / lines. */
  readonly white: UVRect;
  /**
   * Did the LAST completed build skip at least one sprite because the atlas was
   * full — and is a follow-up rebuild worth scheduling? (R2/GL-02.)
   *
   * A skipped chip simply does not draw for that build, and the compaction only
   * happens inside the NEXT `beginInstances`; before this there was no flag,
   * counter or callback on this surface at all, so the caller could not know a
   * chip was missing and could not schedule the rebuild that would compact.
   * If no geometry change followed, the missing chips stayed missing on screen
   * indefinitely.
   *
   * True at most ONCE per overflow episode: if the retry build overflows again
   * the scene genuinely does not fit, and repeating would spin. It re-arms after
   * any build that packs everything.
   */
  atlasOverflowed(): boolean;
  /**
   * Atlas occupancy — diagnostics only (R3/GPU-13 §4 measurement 2: does one
   * merged node+label chip atlas fit at the §6 clamps?).
   *
   * Reads the shelf packer's own cursor: no GL round-trip, no allocation, no
   * per-frame work (ADR 0038 §5). `usedRows` is the high-water row the packer
   * has reached, which is the quantity that decides whether a set of chips fits
   * — a shelf packer wastes some width per row, so rows consumed is the honest
   * measure rather than summed sprite area.
   */
  atlasStats(): {
    /** Atlas edge in texels, AFTER the MAX_TEXTURE_SIZE / high-DPR clamp. */
    size: number;
    /** Rows consumed so far (0 … size). */
    usedRows: number;
    /** Distinct content-keyed sprites currently packed. */
    slots: number;
    /** Did the last build hit the ceiling? */
    full: boolean;
  };

  // --- instance staging (rebuilt only on a geometry change) ---
  beginInstances(): void;
  addSprite(
    anchorX: number,
    anchorY: number,
    localOriginX: number,
    localOriginY: number,
    ux: number,
    uy: number,
    vx: number,
    vy: number,
    uv: UVRect,
    r: number,
    g: number,
    b: number,
    a: number,
    counterScaleFlag: number,
    // Analytic edge-AA (§12): 0 = textured sprite (default; every existing caller),
    // 1 = analytic line, 2 = analytic disc. `halfWidth` is the true stroke
    // half-width / disc radius in SCENE units. Packed into the spare i_misc.y/.z —
    // no instance-stride growth.
    shapeMode?: number,
    halfWidth?: number,
    /**
     * R5/OVL-02: this instance's own counter-scale, packed into the spare
     * `i_misc.w`. `0` (the default) means "use the `u_counterScale` uniform",
     * which keeps every un-migrated emitter behaving exactly as before.
     *
     * Per-instance because ADR 0015's readable floor is stated in terms of the
     * LABEL's on-screen font size, and per-label sizes (ADR 0032) make that a
     * per-label quantity — a single uniform can only ever be right for a
     * default-sized label.
     */
    counterScale?: number
  ): void;
  commitInstances(): void;
  instanceCount(): number;

  // --- per-frame render (one instanced draw call) ---
  render(
    bw: number,
    bh: number,
    zoomDpr: number,
    originXDev: number,
    originYDev: number,
    counterScale: number
  ): void;

  destroy(): void;
}

const compileShader = (
  gl: WebGL2RenderingContext,
  type: number,
  src: string
): WebGLShader | null => {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn(
      '[glSpriteBatch] shader compile failed:',
      gl.getShaderInfoLog(sh)
    );
    gl.deleteShader(sh);
    return null;
  }
  return sh;
};

export const createSpriteBatch = (
  canvas: HTMLCanvasElement,
  atlasSize = 4096
): SpriteBatch | null => {
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl2', {
      alpha: true,
      // Premultiplied pipeline (see FRAG_SRC + the premultiplied blend): the
      // atlas is uploaded premultiplied and the shader outputs premultiplied
      // color, so the context must composite it as premultiplied too.
      premultipliedAlpha: true,
      // No MSAA. Line/border/cap edges are feathered analytically in the fragment
      // shader (§12: fwidth() distance-field coverage — a uniform ~1px feather at
      // every angle/zoom), and every other surface is a textured sprite whose
      // silhouette AA comes from the atlas alpha — neither of which MSAA touches.
      // MSAA was owner-verified as only a partial band-aid (it feathered iso
      // diagonals but not the axis-aligned or sampled cases), so enabling it is
      // pure fill-rate cost across four contexts for no benefit. Guidelines §12.
      antialias: false,
      depth: false,
      stencil: false,
      // So async image-export (dom-to-image / toDataURL) reads the drawn layer
      // rather than a cleared buffer (mirrors the previous per-quad spike).
      preserveDrawingBuffer: true
    }) as WebGL2RenderingContext | null;
  } catch {
    gl = null;
  }
  if (!gl) return null;
  // jsdom / jest-canvas-mock hand back a non-WebGL stub for any getContext arg;
  // feature-check a WebGL2-only entry point so a stub cleanly falls back.
  if (
    typeof gl.createVertexArray !== 'function' ||
    typeof gl.vertexAttribDivisor !== 'function' ||
    typeof gl.getParameter !== 'function'
  ) {
    return null;
  }

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[glSpriteBatch] link failed:', gl.getProgramInfoLog(prog));
    return null;
  }
  const uResolution = gl.getUniformLocation(prog, 'u_resolution');
  const uView = gl.getUniformLocation(prog, 'u_view');
  const uCounterScale = gl.getUniformLocation(prog, 'u_counterScale');
  const uAtlas = gl.getUniformLocation(prog, 'u_atlas');

  // --- atlas texture ---
  const MAX = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  // Atlas dimension is caller-chosen (chip-heavy layers pass 8192; line/fill
  // layers that need only the white/dot texel pass 512). Holds ~ (ATLAS/85)²
  // distinct chips — comfortably more than a viewport-culled scene shows readable
  // at once. A single build that needs MORE (e.g. the fit-to-view harness at
  // N=1000 with LOD labels on) degrades gracefully via atlasFull, never a
  // stale/broken render.
  const ATLAS = Math.min(atlasSize, MAX);
  // R2/GL-12: on a device whose MAX_TEXTURE_SIZE is 2048 the requested 8192
  // atlas silently shrinks to a quarter of its slot budget — measured at fewer
  // than a third of the 85px chips a 4096 atlas holds — so the overflow above
  // becomes reachable at ordinary diagram sizes with no diagnostic anywhere.
  // One line, once per context, so a small-cap device is at least diagnosable.
  if (ATLAS < atlasSize) {
    // eslint-disable-next-line no-console
    console.warn(
      `[Axoview] Sprite atlas clamped from ${atlasSize} to ${ATLAS} by this ` +
        `device's MAX_TEXTURE_SIZE. Large diagrams may drop label chips.`
    );
  }
  const GUTTER = 2; // transparent px between sub-rects so mip levels don't bleed
  const atlasTex = gl.createTexture();
  if (!atlasTex) return null;
  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    ATLAS,
    ATLAS,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null
  );
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // Anisotropic filtering: in ISOMETRIC view every chip/dot is sampled on a
  // SHEARED parallelogram quad, which isotropic mip/linear filtering blurs (the
  // "fuzzy in iso only" report). Aniso samples along the projected axis and keeps
  // sheared text/dots crisp; a no-op in 2D (axis-aligned) and where unsupported.
  const aniso =
    gl.getExtension('EXT_texture_filter_anisotropic') ||
    gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
  if (aniso) {
    const maxAniso = gl.getParameter(
      aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT
    ) as number;
    gl.texParameterf(
      gl.TEXTURE_2D,
      aniso.TEXTURE_MAX_ANISOTROPY_EXT,
      Math.min(16, maxAniso || 1)
    );
  }
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

  // Shelf packer state. The stalk-dot is packed FIRST and its region is RESERVED —
  // a compaction restores the cursor to just past it (dotShelf*), so the persistent
  // `dot` UV survives (its texels are never overwritten).
  let shelfX = 0;
  let shelfY = 0;
  let shelfH = 0;
  let dotShelfX = 0;
  let dotShelfY = 0;
  let dotShelfH = 0;
  // Set when a pack didn't fit. The NEXT beginInstances() compacts (drop the stale
  // chip cache + repack fresh) instead of resetting MID-build — a mid-build reset
  // would strand already-packed sprites on overwritten atlas regions (a
  // silently-broken render). So an overflowing chip simply doesn't draw for one
  // build, then the atlas compacts. Realistic (viewport-culled) scenes never
  // overflow; only the culling-defeated fit-to-view harness reaches this path.
  let atlasFull = false;
  let mipDirty = false;
  const uvCache = new Map<string, { uv: UVRect; version: number }>();
  // R2/GL-05: the atlas had no eviction at all, only the full reset — and the
  // leak is KEY CHURN, not stale content. `texKey` interpolates the node name
  // and every style token, so each rename or restyle mints a NEW key, packs a
  // NEW slot, and the old one is never reclaimed: one logical chip restyled
  // repeatedly fills a 256 atlas on its own, and six bumps occupy six slots.
  // That feeds straight into GL-02.
  //
  // Rather than a free-list (which a shelf packer cannot use without becoming a
  // different packer), keys are GENERATION-TAGGED: every key touched during a
  // build is recorded, and a build that leaves too many untouched marks the
  // atlas stale so the next `beginInstances` compacts through the machinery
  // that already exists. Dead slots therefore cost one extra build, not a
  // session.
  const usedThisBuild = new Set<string>();
  let atlasStale = false;
  // Overflow episode bookkeeping — see `atlasOverflowed`.
  let overflowRetryOffered = false;
  let lastBuildOverflowed = false;

  const resetAtlas = () => {
    // Restore to just past the reserved dot region; drop the (stale) chip cache.
    shelfX = dotShelfX;
    shelfY = dotShelfY;
    shelfH = dotShelfH;
    uvCache.clear();
    atlasFull = false;
    atlasStale = false;
  };

  /**
   * Compact when the dead keys OUTNUMBER the live ones and there are more than a
   * handful of them.
   *
   * Relative, not absolute: a 256 atlas holds ~15 chips, so any fixed threshold
   * large enough to be quiet on a big atlas is never reached on a small one — the
   * churn would still overflow first. And it must not fire for a viewport-culled
   * pan, which legitimately leaves many off-screen chips cached while using many
   * (dead ≈ live), because compacting there re-rasterises the whole visible set
   * every frame. Key churn is the opposite shape: ONE key live, every previous
   * one dead.
   */
  const shouldCompact = (dead: number, live: number) => dead > 8 && dead > live;

  // Reserve a (w×h device-px) slot; returns its top-left, or null (→ atlasFull;
  // the item is skipped this build, the atlas is compacted next build). NEVER
  // resets mid-build.
  const packSlot = (w: number, h: number): { x: number; y: number } | null => {
    if (w + GUTTER > ATLAS || h + GUTTER > ATLAS) return null;
    if (shelfX + w + GUTTER > ATLAS) {
      shelfY += shelfH + GUTTER;
      shelfX = 0;
      shelfH = 0;
    }
    if (shelfY + h + GUTTER > ATLAS) {
      atlasFull = true;
      return null;
    }
    const x = shelfX;
    const y = shelfY;
    shelfX += w + GUTTER;
    if (h > shelfH) shelfH = h;
    return { x, y };
  };

  // Half-texel UV inset (pure math in atlasUVRect) bound to this atlas's size.
  const uvOf = (x: number, y: number, w: number, h: number): UVRect =>
    atlasUVRect(x, y, w, h, ATLAS);

  const putCanvas = (
    key: string,
    version: number,
    make: () => HTMLCanvasElement
  ): UVRect | null => {
    usedThisBuild.add(key);
    const hit = uvCache.get(key);
    if (hit && hit.version === version) return hit.uv;
    const cnv = make();
    const w = cnv.width;
    const h = cnv.height;
    const slot = packSlot(w, h);
    if (!slot) return null;
    gl!.bindTexture(gl!.TEXTURE_2D, atlasTex);
    gl!.texSubImage2D(
      gl!.TEXTURE_2D,
      0,
      slot.x,
      slot.y,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      cnv
    );
    const uv = uvOf(slot.x, slot.y, w, h);
    uvCache.set(key, { uv, version });
    mipDirty = true;
    return uv;
  };

  const putImage = (
    key: string,
    img: TexImageSource,
    w: number,
    h: number
  ): UVRect | null => {
    usedThisBuild.add(key);
    const hit = uvCache.get(key);
    if (hit) return hit.uv;
    const slot = packSlot(w, h);
    if (!slot) return null;
    gl!.bindTexture(gl!.TEXTURE_2D, atlasTex);
    gl!.texSubImage2D(
      gl!.TEXTURE_2D,
      0,
      slot.x,
      slot.y,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      img
    );
    const uv = uvOf(slot.x, slot.y, w, h);
    uvCache.set(key, { uv, version: 0 });
    mipDirty = true;
    return uv;
  };

  // Built-in filled-circle sub-rect for the dotted stalk (round cap parity).
  const DOT_PX = 32;
  const dotCanvas = document.createElement('canvas');
  dotCanvas.width = DOT_PX;
  dotCanvas.height = DOT_PX;
  const dctx = dotCanvas.getContext('2d');
  if (dctx) {
    dctx.clearRect(0, 0, DOT_PX, DOT_PX);
    dctx.fillStyle = '#ffffff';
    dctx.beginPath();
    dctx.arc(DOT_PX / 2, DOT_PX / 2, DOT_PX / 2 - 1, 0, Math.PI * 2);
    dctx.fill();
  }
  const dotUV = putImage('__dot__', dotCanvas, DOT_PX, DOT_PX) ?? {
    u0: 0,
    v0: 0,
    uS: 0,
    vS: 0
  };
  // A solid white texel for tinted solid quads / lines (connector bodies,
  // rectangle fills + borders). Sample its CENTRE so mip minification never bleeds
  // an edge in — a zero-size UV rect anchored mid-texel.
  const WHITE_PX = 4;
  const whiteCanvas = document.createElement('canvas');
  whiteCanvas.width = WHITE_PX;
  whiteCanvas.height = WHITE_PX;
  const wctx = whiteCanvas.getContext('2d');
  if (wctx) {
    wctx.fillStyle = '#ffffff';
    wctx.fillRect(0, 0, WHITE_PX, WHITE_PX);
  }
  const whitePacked = putImage('__white__', whiteCanvas, WHITE_PX, WHITE_PX);
  const whiteUV: UVRect = whitePacked
    ? {
        u0: whitePacked.u0 + whitePacked.uS / 2,
        v0: whitePacked.v0 + whitePacked.vS / 2,
        uS: 0,
        vS: 0
      }
    : { u0: 0, v0: 0, uS: 0, vS: 0 };
  // Reserve the dot + white: a compaction restores the shelf cursor to here, so
  // their texels are never overwritten and `dot`/`white` stay valid across
  // compactions.
  dotShelfX = shelfX;
  dotShelfY = shelfY;
  dotShelfH = shelfH;

  // --- geometry / instancing ---
  const vao = gl.createVertexArray();
  const instBuf = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  for (let loc = 0; loc < 5; loc++) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, ATTR_STRIDE, loc * 16);
    gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindVertexArray(null);

  let staging = new Float32Array(FLOATS_PER_INSTANCE * 1024);
  let floatCount = 0;
  let instCount = 0;
  let instDirty = false;

  const ensureCapacity = (extra: number) => {
    if (floatCount + extra <= staging.length) return;
    let next = staging.length * 2;
    while (floatCount + extra > next) next *= 2;
    const grown = new Float32Array(next);
    grown.set(staging.subarray(0, floatCount));
    staging = grown;
  };

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  // Premultiplied-alpha blend: textures are uploaded premultiplied and the shader
  // premultiplies the tint, so src is already ·α → ONE / ONE_MINUS_SRC_ALPHA.
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  return {
    dot: dotUV,
    white: whiteUV,
    putCanvas,
    putImage,
    beginInstances() {
      // Compact a full atlas here (between builds), never mid-build — see packSlot.
      // `atlasStale` is the churn case (GL-05): the previous build left enough
      // dead keys that repacking is worth one rasterise pass.
      if (atlasFull || atlasStale) resetAtlas();
      usedThisBuild.clear();
      floatCount = 0;
    },
    addSprite(
      anchorX,
      anchorY,
      localOriginX,
      localOriginY,
      ux,
      uy,
      vx,
      vy,
      uv,
      r,
      g,
      b,
      a,
      counterScaleFlag,
      shapeMode = 0,
      halfWidth = 0,
      counterScale = 0
    ) {
      ensureCapacity(FLOATS_PER_INSTANCE);
      const v = staging;
      let i = floatCount;
      v[i++] = anchorX;
      v[i++] = anchorY;
      v[i++] = localOriginX;
      v[i++] = localOriginY;
      v[i++] = ux;
      v[i++] = uy;
      v[i++] = vx;
      v[i++] = vy;
      v[i++] = uv.u0;
      v[i++] = uv.v0;
      v[i++] = uv.uS;
      v[i++] = uv.vS;
      v[i++] = r;
      v[i++] = g;
      v[i++] = b;
      v[i++] = a;
      v[i++] = counterScaleFlag; // i_misc.x
      v[i++] = shapeMode; // i_misc.y (0 textured / 1 line / 2 disc)
      v[i++] = halfWidth; // i_misc.z (scene units)
      // i_misc.w — R5/OVL-02 per-instance counter-scale. 0 = "use the uniform".
      v[i++] = counterScale;
      floatCount = i;
    },
    commitInstances() {
      instCount = (floatCount / FLOATS_PER_INSTANCE) | 0;
      instDirty = true;
      // End of build: decide what the NEXT one has to do about the atlas.
      lastBuildOverflowed = atlasFull;
      if (!atlasFull) {
        overflowRetryOffered = false;
        const live = usedThisBuild.size;
        if (shouldCompact(uvCache.size - live, live)) atlasStale = true;
      }
    },
    atlasOverflowed() {
      if (!lastBuildOverflowed || overflowRetryOffered) return false;
      overflowRetryOffered = true;
      return true;
    },
    atlasStats: () => ({
      size: ATLAS,
      // The shelf cursor IS the occupancy: rows fully consumed, plus the height
      // of the row currently being filled.
      usedRows: shelfY + shelfH,
      slots: uvCache.size,
      full: atlasFull
    }),
    instanceCount: () => instCount,
    render(bw, bh, zoomDpr, originXDev, originYDev, counterScale) {
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      gl!.viewport(0, 0, bw, bh);
      gl!.clearColor(0, 0, 0, 0);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      if (mipDirty) {
        gl!.bindTexture(gl!.TEXTURE_2D, atlasTex);
        gl!.generateMipmap(gl!.TEXTURE_2D);
        mipDirty = false;
      }
      if (instCount === 0) return;
      gl!.useProgram(prog);
      gl!.bindVertexArray(vao);
      if (instDirty) {
        gl!.bindBuffer(gl!.ARRAY_BUFFER, instBuf);
        gl!.bufferData(
          gl!.ARRAY_BUFFER,
          staging.subarray(0, floatCount),
          gl!.DYNAMIC_DRAW
        );
        instDirty = false;
      }
      gl!.uniform2f(uResolution, bw, bh);
      gl!.uniform3f(uView, zoomDpr, originXDev, originYDev);
      gl!.uniform1f(uCounterScale, counterScale);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, atlasTex);
      gl!.uniform1i(uAtlas, 0);
      gl!.drawArraysInstanced(gl!.TRIANGLES, 0, 6, instCount);
      gl!.bindVertexArray(null);
    },
    destroy() {
      gl!.deleteTexture(atlasTex);
      gl!.deleteBuffer(instBuf);
      gl!.deleteVertexArray(vao);
      gl!.deleteProgram(prog);
      gl!.deleteShader(vs);
      gl!.deleteShader(fs);
    }
  };
};
