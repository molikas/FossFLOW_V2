import { apiBaseUrl } from '../utils/apiBaseUrl';
import { setConfiguredPublicBase } from '../appBase';

export interface RuntimeConfig {
  googleClientId: string | null;
  /**
   * Build-time-only fallback for the Google Picker's developer key (Option B /
   * private-share grant). On Cloudflare it is NOT delivered by /api/config —
   * the key stays server-side for the read proxy (ADR 0043 #3) — so it is null
   * there and the Picker rung stays dormant until a browser Picker key is added.
   */
  googleApiKey: string | null;
  /**
   * Whether the backend has a server-side key for the anonymous read proxy
   * (`GET /api/public/drive/:fileId`). Gates the client's public-read rung.
   */
  drivePublicPreview: boolean;
  googleProjectNumber: string | null;
  driveScopes: string[];
  authMode: 'none' | 'shared-token' | 'cf-access';
  serverStorage: boolean;
  /**
   * A5/CHR-08 (owner ruling 2026-07-30). The canonical, externally reachable
   * base URL of this deployment, when the operator has configured one
   * (`PUBLIC_BASE_URL`). Every share link the app mints resolves against it,
   * falling back to `window.location.origin` otherwise — so a preview, staging
   * or LAN origin cannot leak into a durable link that outlives the session
   * that created it, while single-origin deployments are unaffected.
   *
   * This is standard for products that mint shareable links (GitLab
   * `external_url`, Grafana `root_url`, Sentry `system.url-prefix`, Discourse
   * `hostname`). It KEEPS the page-origin default that made the copied link
   * openable as copied — the backend-derived host was the earlier bug — and
   * only lets an operator override it deliberately.
   */
  publicBaseUrl: string | null;
}

// ADR 0035 §4: a pure-local `npm run dev` boot has no backend serving
// /api/config, so fall back to the build-time PUBLIC_GOOGLE_CLIENT_ID (rsbuild
// exposes PUBLIC_-prefixed vars to the browser bundle) so localhost:3000 — an
// authorized origin — can still start Google sign-in. Empty → null (Drive UI
// stays hidden). On Cloudflare this var is unset and the client id arrives via
// /api/config instead.
const BUILD_TIME_CLIENT_ID = process.env.PUBLIC_GOOGLE_CLIENT_ID || null;

// ADR 0042 §5: same build-time fallback pattern for the Drive preview values —
// null means the key-read rung and the Picker are unavailable (graceful
// degradation, not an error).
const BUILD_TIME_API_KEY = process.env.PUBLIC_GOOGLE_API_KEY || null;
const BUILD_TIME_PROJECT_NUMBER = process.env.PUBLIC_GOOGLE_PROJECT_NUMBER || null;

const DEFAULT_CONFIG: RuntimeConfig = {
  googleClientId: BUILD_TIME_CLIENT_ID,
  googleApiKey: BUILD_TIME_API_KEY,
  drivePublicPreview: false,
  googleProjectNumber: BUILD_TIME_PROJECT_NUMBER,
  driveScopes: ['https://www.googleapis.com/auth/drive.file'],
  authMode: 'none',
  serverStorage: false,
  publicBaseUrl: null
};

let cached: RuntimeConfig | null = null;
let inflight: Promise<RuntimeConfig> | null = null;

export async function fetchRuntimeConfig(): Promise<RuntimeConfig> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    let response: Response;
    try {
      // 800ms is generous for any healthy backend (docker prod ≈45ms) and
      // caps the worst case when the backend is absent — Chrome/Windows can
      // otherwise spend ~2s on a dual-stack connect probe before reporting
      // ECONNREFUSED to JS.
      response = await fetch(`${apiBaseUrl()}/api/config`, {
        signal: AbortSignal.timeout(800)
      });
    } catch (err) {
      // A2/STOR-11 (owner ruling 2026-07-30) — cache success only. A transport
      // failure, including the 800 ms timeout above, is not an answer: fall
      // back for THIS caller but never latch it, so a slow-but-healthy backend
      // cannot hide a whole server workspace for the life of the page. ADR 0009
      // D2's single-probe fast path is unchanged, and `inflight` still dedupes
      // the concurrent callers of a boot.
      console.warn(
        '[useRuntimeConfig] /api/config probe failed; falling back to defaults (Local mode) for this call — the next one will re-probe',
        err
      );
      return { ...DEFAULT_CONFIG };
    }

    // A response — including a 4xx/5xx — is this deploy answering, so it is
    // cacheable in the way a timeout is not.
    if (!response.ok) {
      console.warn(
        '[useRuntimeConfig] /api/config returned',
        response.status,
        '; falling back to defaults (Local mode)'
      );
      cached = { ...DEFAULT_CONFIG };
      return cached;
    }
    try {
      const data = (await response.json()) as Partial<RuntimeConfig>;
      cached = { ...DEFAULT_CONFIG, ...data };
    } catch (err) {
      console.warn('[useRuntimeConfig] /api/config returned unparseable JSON', err);
      cached = { ...DEFAULT_CONFIG };
      return cached;
    }
    // The build-time id is a true fallback: if the backend omits or nulls
    // googleClientId, keep whatever was baked in at build (local dev).
    if (!cached.googleClientId) cached.googleClientId = BUILD_TIME_CLIENT_ID;
    if (!cached.googleApiKey) cached.googleApiKey = BUILD_TIME_API_KEY;
    if (!cached.googleProjectNumber) cached.googleProjectNumber = BUILD_TIME_PROJECT_NUMBER;
    // CHR-08: publish the configured base to the link builders, which are not
    // React and cannot read this hook. Normalised here (trailing slashes
    // stripped, non-strings dropped) so every consumer sees one shape.
    setConfiguredPublicBase(cached.publicBaseUrl);
    return cached;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
