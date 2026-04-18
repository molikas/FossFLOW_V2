import { useCallback } from 'react';

/**
 * Provides a function to generate a base64 PNG thumbnail from the canvas.
 * The thumbnail is generated from the isometric canvas element using dom-to-image-more.
 * Returns null if generation fails (e.g., canvas not mounted yet).
 */
export function useThumbnail() {
  const generateThumbnail = useCallback(async (): Promise<string | null> => {
    try {
      // Find the main SVG/canvas element rendered by Isoflow
      const canvas = document.querySelector('.isoflow-renderer') as HTMLElement | null;
      if (!canvas) return null;

      // Dynamic import to avoid bundling dom-to-image-more when not needed
      const domToImage = await import('dom-to-image-more' as any).catch(() => null);
      if (!domToImage) return null;

      const dataUrl: string = await domToImage.default.toPng(canvas, {
        width: 400,
        height: 300,
        style: { transform: 'scale(0.5)', transformOrigin: 'top left' }
      });

      return dataUrl;
    } catch {
      return null;
    }
  }, []);

  return { generateThumbnail };
}
