import domtoimage from 'dom-to-image-more';
import { optimizeSvgDataUrl, utf8ToBase64 } from './svgOptimizer';
import { stripDefaultIcons } from './leanSave';
import type { Icon } from 'src/types';
import { computeRenderTarget } from './renderTarget';
import { Model, Size } from '../types';

export const generateGenericFilename = (extension: string) => {
  return `axoview-export-${new Date().toISOString()}.${extension}`;
};

const slugifyTitle = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
};

export const generateTitleFilename = (
  title: string | undefined,
  extension: string
): string => {
  const slug = slugifyTitle(title || '');
  if (!slug) return generateGenericFilename(extension);
  // Short YYYYMMDD-HHmm suffix keeps the filename unique without dominating it.
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${slug}-${stamp}.${extension}`;
};

export const base64ToBlob = (
  base64: string,
  contentType: string,
  sliceSize = 512
) => {
  const byteCharacters = atob(base64);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);

    const byteNumbers = new Array(slice.length);

    for (let i = 0; i < slice.length; i += 1) {
      byteNumbers[i] = slice.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  const blob = new Blob(byteArrays, { type: contentType });

  return blob;
};

export const downloadFile = (data: Blob, filename: string) => {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * ADR 0003 addendum (2026-08-01) — the catalog is the HOST's, so the caller
 * passes it. Without it this wrote every icon the session had loaded into the
 * file (F5/ICON-01/02): the lib's half of lean-save ran against an empty
 * fixture and stripped nothing.
 */
export const exportAsJSON = (model: Model, catalog: readonly Icon[] = []) => {
  const lean = stripDefaultIcons(model, catalog);
  const data = new Blob([JSON.stringify(lean)], {
    type: 'application/json;charset=utf-8'
  });

  downloadFile(data, generateTitleFilename(model.title, 'json'));
};

export const exportAsImage = async (
  el: HTMLDivElement,
  size?: Size,
  scale: number = 1,
  bgcolor: string = '#ffffff'
) => {
  // Clamp the requested scale against the browser's canvas limits (ADR 0025 §2)
  // so a large diagram at 4× yields a real image instead of a silent blank.
  const baseW = size ? size.width : el.clientWidth;
  const baseH = size ? size.height : el.clientHeight;
  const target = computeRenderTarget({ width: baseW, height: baseH }, scale);
  const { width, height, effectiveScale } = target;

  // dom-to-image-more is a better maintained fork. No cacheBust: the export
  // renders a fresh hidden Axoview each time (nothing stale to bust), and the
  // busting query param makes dom-to-image re-fetch every resource — which some
  // hosts reject cross-origin with "Failed to fetch" (F-02).
  const options = {
    width,
    height,
    bgcolor,
    quality: 1.0,
    // Apply CSS transform for high-quality scaling
    style:
      effectiveScale !== 1
        ? {
            transform: `scale(${effectiveScale})`,
            transformOrigin: 'top left'
          }
        : undefined
  };

  try {
    const imageData = await domtoimage.toPng(el, options);
    return imageData;
  } catch (error) {
    console.error('Export failed, trying fallback method:', error);
    // Fallback: try with minimal options
    return await domtoimage.toPng(el, { width, height, bgcolor });
  }
};

// Wrap a PNG raster in a minimal SVG document. Used as the SVG-export fallback
// when dom-to-image's native toSvg cannot inline a resource on the deployed host
// ("Failed to fetch") — a raster inside <svg> is degraded (not vector) but it is
// a usable, downloadable file rather than a dead-end (ADR 0011 / F-02).
const rasterPngToSvgDataUrl = (
  pngDataUrl: string,
  width: number,
  height: number
): string => {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    `<image href="${pngDataUrl}" width="${width}" height="${height}"/></svg>`;
  return `data:image/svg+xml;base64,${utf8ToBase64(svg)}`;
};

export const exportAsSVG = async (
  el: HTMLDivElement,
  size?: Size,
  bgcolor: string = '#ffffff'
) => {
  // SVG exports at 1× (it is markup, not a raster), but the same calculator
  // still clamps pathological bounds so the embedded foreignObject never
  // exceeds what a browser will rasterize on download/preview (ADR 0025 §2).
  const baseW = size ? size.width : el.clientWidth;
  const baseH = size ? size.height : el.clientHeight;
  const { width, height } = computeRenderTarget(
    { width: baseW, height: baseH },
    1
  );

  // No cacheBust — see exportAsImage. Re-fetching resources with a busting query
  // is what makes the deployed SVG export throw "Failed to fetch" (F-02).
  const options = {
    width,
    height,
    bgcolor,
    quality: 1.0
  };

  try {
    const svgData = await domtoimage.toSvg(el, options);
    return optimizeSvgDataUrl(svgData);
  } catch (error) {
    // Native SVG generation can fail on hosts that reject dom-to-image's
    // cross-origin resource fetch. Retrying toSvg would fail identically, so
    // degrade to a raster-backed SVG (the PNG capture path works) — the download
    // always produces a usable file instead of dead-ending (ADR 0011 / F-02).
    console.error('SVG export failed; falling back to a raster-backed SVG:', error);
    const pngDataUrl = await domtoimage.toPng(el, { width, height, bgcolor });
    return rasterPngToSvgDataUrl(pngDataUrl, width, height);
  }
};
