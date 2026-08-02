/**
 * Where `/api/*` lives.
 *
 * Same-origin everywhere except one case: `npm run dev`, which serves the SPA
 * from rsbuild on :3000 and the Express backend separately on :3001.
 *
 * A5/CHR-07 — this used to identify that case by sniffing
 * `hostname === 'localhost' && port === '3000'`, which the Docker deployment
 * the README documents ALSO matches: `compose.dev.yml` publishes nginx as
 * `"3000:80"`. So in the container every API call was addressed to
 * `http://localhost:3001`, bypassing the nginx proxy that fronts the API and
 * violating the app's own CSP — `connect-src 'self'`, and a different port is a
 * different origin. Server storage appeared broken in the deployment the docs
 * tell people to use.
 *
 * The port cannot tell them apart, because the deployment deliberately serves
 * on the port developers expect. The BUILD can: the container runs a production
 * bundle, `npm run dev` sets `NODE_ENV=development`, and rsbuild inlines the
 * value at build time (`define` in rsbuild.config.ts). So the dev split is
 * gated on the build-time signal first; the port check is kept only to narrow
 * it further, so a development build served from anywhere else still gets
 * same-origin.
 *
 * Default is same-origin, which is the safe direction: a wrong same-origin
 * guess produces a visible 404, while a wrong cross-origin guess produces a CSP
 * violation in the console and a silently dead feature.
 */
export function apiBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  // A literal comparison after the build, not a runtime environment read.
  if (process.env.NODE_ENV === 'production') return '';
  if (
    window.location.hostname === 'localhost' &&
    window.location.port === '3000'
  ) {
    return 'http://localhost:3001';
  }
  return '';
}
