import { useEffect, useState } from 'react';

// Cache of natural aspect (naturalHeight / naturalWidth) per image URL, so the
// selection box (ADR 0044) can size a node's screen-space outline to the icon's
// actual rendered height. Populated once per URL; the browser image cache makes
// the second load instant (the WebGL layer already fetched it).
//
// R5/OVL-03: the cache was written only on a successful `onload`, and there was
// no `onerror` handler at all — so a url that fails leaves the outline at aspect
// 1 forever AND is re-requested on every mount, because a MISS was never
// memoised. (The exact inverse of R3/GPU-03, where a transient failure WAS
// cached as permanent — the two icon caches got the trade-off wrong in opposite
// directions.) `FAILED` is that sentinel: a known-bad url is asked for once, and
// the fallback aspect it implies is seeded synchronously on the next mount
// rather than after another round trip.
const FAILED = Symbol('image-load-failed');
const aspectCache = new Map<string, number | typeof FAILED>();

/** The cached aspect, or 1 for "unknown" and for "known bad". */
const cachedAspect = (url?: string): number => {
  if (!url) return 1;
  const hit = aspectCache.get(url);
  return typeof hit === 'number' ? hit : 1;
};

export const useImageAspect = (url?: string): number => {
  const [aspect, setAspect] = useState<number>(() => cachedAspect(url));

  useEffect(() => {
    if (!url) {
      setAspect(1);
      return;
    }
    const cached = aspectCache.get(url);
    if (cached !== undefined) {
      // Includes the FAILED sentinel — a square fallback, without a re-fetch.
      setAspect(cachedAspect(url));
      return;
    }
    if (typeof Image === 'undefined') return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      const a = img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : 1;
      aspectCache.set(url, a);
      if (!cancelled) setAspect(a);
    };
    img.onerror = () => {
      // Memoise the FAILURE so a dead url is requested once per session rather
      // than on every mount of every selection outline that names it.
      aspectCache.set(url, FAILED);
      if (!cancelled) setAspect(1);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return aspect;
};
