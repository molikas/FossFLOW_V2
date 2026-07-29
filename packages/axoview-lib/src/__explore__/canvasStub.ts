/**
 * jsdom ships no canvas 2D context, and `getTextBoxDimensions` (isoMath) throws
 * `Could not get canvas context` without one — so ANY probe that creates or
 * edits a text box dies at the reducer unless a stub is installed.
 *
 * This matters beyond convenience: a probe written as `it.failing` that throws
 * during setup looks like a confirmed bug when it is really an environment
 * failure. Install this in every probe that touches text boxes.
 *
 * The measurement is a deterministic approximation (0.55em per character,
 * scaled by the font size parsed out of `ctx.font`) — enough for size-change
 * comparisons, not a claim about real glyph metrics.
 */
let installed = false;

export function installCanvasStub() {
  if (installed) return;
  installed = true;

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
      measureText(text: string) {
        const px = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '16');
        return { width: text.length * px * 0.55 };
      }
    };
  } as never;
}
