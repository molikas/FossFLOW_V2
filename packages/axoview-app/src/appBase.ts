// The URL path the editor SPA is mounted under.
//
// R1 (ADR 0040): the marketing landing owns the site root (`/`); the editor
// lives under `/app`. `PUBLIC_URL` still prefixes for sub-path self-host
// deploys, so the basename is `${PUBLIC_URL}/app` (e.g. `/app`, or `/foo/app`
// when PUBLIC_URL=`/foo`). Shared by the router basename (App.tsx) and share-URL
// construction (shareUrl.ts) so the two never disagree.
const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/$/, '');

export const APP_BASENAME = `${publicUrl}/app`;

/**
 * A5/CHR-08 (owner ruling 2026-07-30): the operator's canonical public base
 * URL, when `/api/config` carries one. Set once by `fetchRuntimeConfig` — the
 * link builders are plain functions, not React, so they cannot read the hook.
 * Null (the default) keeps the page-origin behaviour exactly as it was.
 */
let configuredPublicBase: string | null = null;

export function setConfiguredPublicBase(value: string | null | undefined): void {
  configuredPublicBase =
    typeof value === 'string' && value.trim() !== ''
      ? value.trim().replace(/\/+$/, '')
      : null;
}

/** Exported for tests and for the CHR-08 contract check. */
export function getConfiguredPublicBase(): string | null {
  return configuredPublicBase;
}

/**
 * The `${base}${APP_BASENAME}/display` prefix shared by every read-only link
 * builder (public-snapshot `shareUrl.ts`, Drive `driveSharing.ts`).
 *
 * `base` is the operator's configured public base URL when there is one, and
 * the page origin otherwise — never a backend-derived host, which was the bug
 * the page-origin default fixed. The configured base exists so a preview,
 * staging or LAN origin cannot leak into a durable link that outlives the
 * session that minted it (CHR-08). No behaviour change for a single-origin
 * deployment. Empty origin (SSR/test with no window) degrades to a relative
 * path.
 */
export function appDisplayBase(): string {
  if (configuredPublicBase) return `${configuredPublicBase}${APP_BASENAME}/display`;
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : '';
  return `${origin}${APP_BASENAME}/display`;
}
