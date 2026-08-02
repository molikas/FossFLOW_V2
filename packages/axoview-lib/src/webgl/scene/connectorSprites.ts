// Content-keyed sprites the connector emitter tints: a right-pointing arrowhead
// and an ellipse outline (the DOUBLE_WITH_CIRCLE marker). Both are packed through
// `putCanvas`, so they re-rasterise after an atlas compaction rather than leaving
// a stale UV behind — which is why they live here rather than being captured once
// at context creation the way the pre-merge `ConnectorsCanvas` did.

/**
 * A right-pointing arrowhead (+x), black fill + white outline — mirrors the DOM
 * connector arrow polygon. Rotated per-connector to the last segment.
 */
export const makeArrowCanvas = (): HTMLCanvasElement => {
  const S = 64;
  const cnv = document.createElement('canvas');
  cnv.width = S;
  cnv.height = S;
  const ctx = cnv.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);
  // Triangle pointing +x: apex at (right, mid), base on the left.
  ctx.beginPath();
  ctx.moveTo(S * 0.92, S * 0.5);
  ctx.lineTo(S * 0.12, S * 0.12);
  ctx.lineTo(S * 0.12, S * 0.88);
  ctx.closePath();
  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = S * 0.11;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fill();
  return cnv;
};

/** An ellipse-outline sprite (white, tintable) for the DOUBLE_WITH_CIRCLE marker. */
export const makeRingCanvas = (): HTMLCanvasElement => {
  const S = 64;
  const cnv = document.createElement('canvas');
  cnv.width = S;
  cnv.height = S;
  const ctx = cnv.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = '#ffffff';
  const lw = S * 0.1;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.ellipse(S / 2, S / 2, S / 2 - lw, S / 2 - lw, 0, 0, Math.PI * 2);
  ctx.stroke();
  return cnv;
};
