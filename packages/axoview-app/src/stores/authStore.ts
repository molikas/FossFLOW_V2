import { create } from 'zustand';
import { notificationStore } from './notificationStore';
import { authDebug } from '../utils/authDebug';

// ADR 0035 — Google Identity & Drive Authorization (token model).
//
// Browser-side GIS token flow: an implicit-grant access token (~1h), held in
// memory ONLY. There is NO refresh token and NO client secret. "Refresh" means
// silently re-invoking the GIS token client (prompt: ''), which succeeds only
// while the browser session allows it — otherwise the user re-consents.
//
// The store never persists the token (no zustand persist middleware): the unit
// suite spies on localStorage.setItem to enforce this.
//
// 2026-07-06 amendment (storage-ux-unification): the user's PROFILE (name /
// email / avatar URL — never the token) persists in localStorage as a
// "remember me" hint. On boot, a present hint triggers one silent token
// attempt (RECONNECTING); failure degrades quietly to a signed-out avatar
// with a reconnect affordance — no toast, no popup.

export type AuthStatus =
  | 'UNAUTHENTICATED'
  | 'AUTHENTICATING'
  | 'RECONNECTING'
  | 'AUTHENTICATED'
  | 'REFRESHING'
  | 'SESSION_EXPIRED'
  // Identity was granted but the drive.file scope was withheld (Drive checkbox
  // left unchecked). Signing in exists only to reach Drive, so this is NOT a
  // usable session — a blocking re-consent dialog is the only way forward.
  | 'DRIVE_ACCESS_REQUIRED';

export interface AuthUser {
  name: string;
  email: string;
  avatarUrl: string;
}

/** Subset of the GIS token response we consume. */
export interface TokenResponse {
  access_token: string;
  expires_in?: number;
  /** Space-delimited scopes the user ACTUALLY granted (granular consent). */
  scope?: string;
}

type TokenRequest = (opts?: { prompt?: string; hint?: string }) => void;
type TokenRevoke = (token: string) => void;

interface Waiter {
  resolve: () => void;
  reject: () => void;
}

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
  expiresAt: number | null; // epoch ms
  /**
   * Whether the CURRENT token carries the drive.file scope. Google's granular
   * consent lets a user sign in while leaving the Drive checkbox unchecked —
   * identity works but every Drive call 403s. null = no token yet / unknown.
   */
  driveScopeGranted: boolean | null;

  // Bridge to the GIS token client, registered by AuthProvider. Null until the
  // provider mounts (or when no client id is configured) — every entry point
  // guards on it so pre-bridge calls are safe no-ops.
  _requestToken: TokenRequest | null;
  _revoke: TokenRevoke | null;
  _waiters: Waiter[];
  /**
   * A silent (`prompt: ''`) GIS request has been issued and no callback has
   * come back for it yet. Survives the status transitions that abandon such a
   * request (`markDriveScopeMissing`, `markExpired`), so an interactive request
   * opened afterwards still knows a late error is coming. S1/AUTH-02.
   */
  _silentRequestOutstanding: boolean;
  /**
   * Set when an interactive signIn supersedes an in-flight silent request
   * (boot reconnect / refresh). GIS gives no request correlation, so the
   * superseded request's LATE error callback would otherwise be taken for the
   * popup's own cancellation — resetting AUTHENTICATING and discarding the
   * grant the user is about to complete. _onError absorbs exactly one error
   * while this is set.
   */
  _absorbStaleError: boolean;

  _setBridge: (bridge: { requestToken: TokenRequest; revoke: TokenRevoke }) => void;

  /**
   * Interactive sign-in. Always resolves (never throws).
   *
   * `prompt: 'select_account'` opens Google's account chooser instead of
   * silently re-picking the remembered account — the S1/AUTH-11 route. It
   * exists so "use a different account" no longer has to `signOut()` first
   * (which destroyed the identity and the recovery affordance BEFORE knowing
   * whether the user would pick anything).
   */
  signIn: (options?: { prompt?: 'select_account' }) => Promise<void>;
  /**
   * Revokes the token and resets to UNAUTHENTICATED. ADR 0035 rule 3: callers
   * that may have Drive writes in flight MUST flush them BEFORE calling this
   * (see AuthControl's sign-out flow) — the store cannot see the storage layer,
   * so the ordering is enforced at the call site.
   */
  signOut: () => void;
  /**
   * Boot-time silent reconnect: fires one prompt:'' token request when a
   * profile hint exists. Quiet on failure (no toast, no state-machine noise) —
   * the avatar's reconnect affordance is the recovery path. No-op unless a
   * hint is present and the store is UNAUTHENTICATED.
   */
  attemptSilentReconnect: () => Promise<void>;
  /**
   * The ONLY way any module obtains the access token. Returns the current token
   * if healthy (>5min to expiry), attempts a silent refresh if near expiry, or
   * null when unauthenticated / refresh failed.
   */
  getValidToken: () => Promise<string | null>;
  /** Force SESSION_EXPIRED (e.g. a Drive 401 despite a not-yet-expired token). */
  markExpired: () => void;
  /**
   * Re-open Google's consent screen with the Drive checkbox (prompt:'consent'),
   * so a user who signed in without granting drive.file can grant it. Drives the
   * DRIVE_ACCESS_REQUIRED dialog's primary action.
   */
  grantDriveAccess: () => void;
  /**
   * Park the session in DRIVE_ACCESS_REQUIRED after a Drive call 403s for
   * insufficient scopes despite an AUTHENTICATED status (scope revoked
   * out-of-band). Routes the same blocking re-consent dialog.
   */
  markDriveScopeMissing: () => void;

  // Called by AuthProvider's GIS callbacks — not for external use.
  _onToken: (resp: TokenResponse) => void;
  _onError: (reason?: unknown) => void;
  _setUser: (user: AuthUser | null) => void;
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// Safety net for a stuck GIS flow. The popup mints the token and self-closes,
// but COOP can block GIS's window.closed polling so neither onSuccess nor
// onError ever fires — the status would spin forever (observed live as an
// endless reconnect spinner needing a page reload). If nothing settles the
// request in time, we synthesise a failure so the UI recovers. Interactive
// gets a long budget (the user may be reading the consent screen); silent
// attempts should be near-instant.
const AUTH_TIMEOUT_INTERACTIVE_MS = 120_000;
const AUTH_TIMEOUT_SILENT_MS = 25_000;
let pendingAuthTimeout: ReturnType<typeof setTimeout> | null = null;
// S1/AUTH-03: the deadline the current request was armed with, so an absorbed
// error can re-arm it. The timer callback nulls `pendingAuthTimeout` before it
// runs, and nothing else re-armed — so the safety net fired exactly once and,
// when `_absorbStaleError` was set, that one shot was swallowed by the absorber
// it was supposed to be independent of.
let pendingAuthTimeoutMs: number | null = null;
function clearAuthTimeout(): void {
  if (pendingAuthTimeout !== null) {
    clearTimeout(pendingAuthTimeout);
    pendingAuthTimeout = null;
  }
  pendingAuthTimeoutMs = null;
}

/**
 * S1/AUTH-03: the synthetic failure the timeout raises is NOT a GIS callback —
 * it is the recovery path of last resort — so `_onError` must never treat it as
 * a superseded request's late error and absorb it. Tagged rather than routed
 * around `_onError` so all the recovery transitions stay in one place.
 */
const TIMEOUT_REASON = { type: 'timeout' as const };
const isTimeoutReason = (reason: unknown): boolean =>
  typeof reason === 'object' &&
  reason !== null &&
  (reason as { type?: unknown }).type === 'timeout';

function armAuthTimeout(ms: number): void {
  clearAuthTimeout();
  pendingAuthTimeoutMs = ms;
  pendingAuthTimeout = setTimeout(() => {
    pendingAuthTimeout = null;
    const st = useAuthStore.getState();
    if (st.status === 'AUTHENTICATING' || st.status === 'RECONNECTING' || st.status === 'REFRESHING') {
      authDebug('[auth] request timed out — recovering from a stuck popup/handshake');
      st._onError(TIMEOUT_REASON);
    }
  }, ms);
}

/** Re-arm the deadline the in-flight request still needs (AUTH-03). */
function rearmAuthTimeout(): void {
  if (pendingAuthTimeoutMs !== null) armAuthTimeout(pendingAuthTimeoutMs);
}

/**
 * S1/AUTH-16: caches keyed to the Google account that is signing out (the Drive
 * root folder id, in localStorage AND in the provider's memory). The store must
 * not import the provider — the provider reads the token from here — so the
 * provider registers a handler instead.
 */
type SessionResetHandler = () => void;
const sessionResetHandlers = new Set<SessionResetHandler>();
export function onAuthSessionReset(handler: SessionResetHandler): () => void {
  sessionResetHandlers.add(handler);
  return () => sessionResetHandlers.delete(handler);
}
function fireSessionReset(why: string): void {
  authDebug('[auth] per-account caches invalidated:', why);
  sessionResetHandlers.forEach((handler) => {
    try {
      handler();
    } catch {
      /* a cache that refuses to clear must not break sign-out */
    }
  });
}

// Profile hint — identity only, NEVER credentials. Presence means "this
// browser signed in before"; it drives the boot reconnect + avatar rendering.
const PROFILE_HINT_KEY = 'axoview-google-profile';

/**
 * Owner ruling 2026-07-30 (S1/AUTH-13): a hint is valid only with a non-empty
 * `name` AND `email`. The email is what makes it usable — it is the
 * `login_hint` the silent reconnect needs, and without it the "remembered"
 * account can neither be displayed nor reconnected, so the honest render is the
 * never-signed-in control. An invalid hint is dropped rather than repaired.
 */
const isUsableHint = (user: Pick<AuthUser, 'name' | 'email'>): boolean =>
  user.name.trim() !== '' && user.email.trim() !== '';

function loadProfileHint(): AuthUser | null {
  try {
    const raw = localStorage.getItem(PROFILE_HINT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const p = parsed as Partial<AuthUser>;
    if (typeof p.name !== 'string') return null;
    const user: AuthUser = {
      name: p.name,
      email: typeof p.email === 'string' ? p.email : '',
      avatarUrl: typeof p.avatarUrl === 'string' ? p.avatarUrl : ''
    };
    if (!isUsableHint(user)) {
      // Written by an older build (or a userinfo response with no email).
      clearProfileHint();
      return null;
    }
    return user;
  } catch {
    return null;
  }
}

function saveProfileHint(user: AuthUser): void {
  // AUTH-13: never persist what `loadProfileHint` would refuse to read back.
  if (!isUsableHint(user)) {
    authDebug('[auth] not persisting an email-less profile hint');
    return;
  }
  try {
    localStorage.setItem(PROFILE_HINT_KEY, JSON.stringify(user));
  } catch {
    /* hint is an accelerator only */
  }
}

function clearProfileHint(): void {
  try {
    localStorage.removeItem(PROFILE_HINT_KEY);
  } catch {
    /* ignore */
  }
}

// Toast copy stays literal here: this store is imported by non-React modules
// and unit suites where the i18n singleton (http-backend init) must not load.
// Catalogued i18n debt — see the storage-ux-unification tactical doc.
function pushExpiredNotice(signIn: () => void): void {
  notificationStore.push({
    severity: 'warning',
    persistent: true,
    message:
      'Your Google session expired. Sign in again to keep saving to Google Drive.',
    action: { label: 'Sign in again', onClick: signIn }
  });
}

/**
 * S1/AUTH-02: whether an interactive request opened NOW supersedes a silent one
 * that can still deliver a late callback — the single derivation both
 * `signIn()` and `grantDriveAccess()` use for `_absorbStaleError`.
 * `grantDriveAccess` used to pin it `false` unconditionally, so the superseded
 * request's late error was taken for the consent popup's own cancellation:
 * UNAUTHENTICATED + "Sign-in cancelled" while the user was consenting, and the
 * grant that followed discarded on `_onToken`'s status guard.
 *
 * The status alone is not enough to answer it. `markDriveScopeMissing()` (and
 * `markExpired()`) move the session OUT of REFRESHING while the GIS request
 * they interrupted is still genuinely outstanding in the browser — which is
 * precisely the route into `grantDriveAccess`. `_silentRequestOutstanding`
 * remembers what the status forgets; it is consumed by the first callback that
 * arrives, so it can absorb at most one error per silent request.
 */
const supersedesSilentRequest = (
  status: AuthStatus,
  silentRequestOutstanding: boolean
): boolean =>
  status === 'RECONNECTING' ||
  status === 'REFRESHING' ||
  silentRequestOutstanding;

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'UNAUTHENTICATED',
  // Remember-me: pre-populate identity from the hint so the avatar renders
  // (in its needs-reconnect state) from the first paint after a reload.
  user: loadProfileHint(),
  accessToken: null,
  expiresAt: null,
  driveScopeGranted: null,
  _requestToken: null,
  _revoke: null,
  _waiters: [],
  _silentRequestOutstanding: false,
  _absorbStaleError: false,

  _setBridge: ({ requestToken, revoke }) => {
    set({ _requestToken: requestToken, _revoke: revoke });
  },

  signIn: (options) => {
    const { _requestToken, status } = get();
    if (!_requestToken) return Promise.resolve();
    // S1/AUTH-07: idempotent. A second click while a popup is already open used
    // to fire a SECOND GIS request; because the prior status was AUTHENTICATING
    // (not RECONNECTING/REFRESHING) `_absorbStaleError` stayed false, so closing
    // the now-redundant first popup took `_onError`'s cancel branch and settled
    // BOTH waiters — and the grant completed in the second popup was then
    // dropped on `_onToken`'s status guard. Reachable: `LocalModeBanner`'s
    // sign-in button and the persistent expired notice's action are both live
    // throughout. Piggyback on the request in flight, exactly as
    // `getValidToken` already does.
    if (status === 'AUTHENTICATING') {
      authDebug('[auth] signIn: a request is already in flight — piggybacking');
      return new Promise<void>((resolve) => {
        set((s) => ({ _waiters: [...s._waiters, { resolve, reject: resolve }] }));
      });
    }
    // A silent boot reconnect may still be in flight — the interactive request
    // supersedes it; both settle from the same waiter list. The superseded
    // request can still deliver a late error: flag it for _onError to absorb
    // so it can't cancel this interactive attempt.
    set({
      status: 'AUTHENTICATING',
      _absorbStaleError: supersedesSilentRequest(
        status,
        get()._silentRequestOutstanding
      )
    });
    return new Promise<void>((resolve) => {
      // signIn always resolves — both success and denial settle the waiter.
      set((s) => ({ _waiters: [...s._waiters, { resolve, reject: resolve }] }));
      armAuthTimeout(AUTH_TIMEOUT_INTERACTIVE_MS);
      _requestToken(options?.prompt ? { prompt: options.prompt } : undefined);
    });
  },

  attemptSilentReconnect: () => {
    const s = get();
    if (!s._requestToken || !s.user) return Promise.resolve();
    if (s.status !== 'UNAUTHENTICATED') return Promise.resolve();
    // login_hint: with several Google accounts in the browser, a hint-less
    // silent request needs the account chooser ("interaction required") and
    // fails. The persisted email names the account so Google can stay silent.
    const hint = s.user.email || undefined;
    authDebug('[auth] silent reconnect: attempting', hint ? `(hint=${hint})` : '(no hint)');
    set({ status: 'RECONNECTING', _silentRequestOutstanding: true });
    return new Promise<void>((resolve) => {
      set((st) => ({ _waiters: [...st._waiters, { resolve, reject: resolve }] }));
      armAuthTimeout(AUTH_TIMEOUT_SILENT_MS);
      s._requestToken!({ prompt: '', ...(hint ? { hint } : {}) });
    });
  },

  signOut: () => {
    const { accessToken, _revoke, _waiters } = get();
    clearAuthTimeout();
    if (accessToken && _revoke) _revoke(accessToken);
    clearProfileHint();
    set({
      status: 'UNAUTHENTICATED',
      user: null,
      accessToken: null,
      expiresAt: null,
      driveScopeGranted: null,
      _waiters: [],
      _silentRequestOutstanding: false,
      _absorbStaleError: false
    });
    // Settle any in-flight signIn/getValidToken promise so its awaiter (e.g. a
    // Drive request mid-refresh) doesn't hang forever on the discarded waiter.
    _waiters.forEach((w) => w.reject());
    // S1/AUTH-16: the profile hint was the only per-account thing sign-out
    // cleared. The Drive root folder id survived in BOTH localStorage and the
    // provider's memory, and `StorageManager` keeps one provider for the page
    // lifetime — so signing in as a second account inherited account A's root:
    // `resolveRoot()` short-circuits on the in-memory id, past the
    // `folderExists()` check that would have healed the cached one.
    fireSessionReset('signOut');
  },

  getValidToken: () => {
    const s = get();
    if (
      s.status === 'UNAUTHENTICATED' ||
      s.status === 'SESSION_EXPIRED' ||
      s.status === 'DRIVE_ACCESS_REQUIRED'
    ) {
      return Promise.resolve(null);
    }
    if (
      s.accessToken &&
      s.expiresAt &&
      s.expiresAt - Date.now() > REFRESH_MARGIN_MS
    ) {
      return Promise.resolve(s.accessToken);
    }
    // A request is already in flight (boot reconnect, interactive sign-in, or
    // another caller's refresh) — piggyback on it instead of firing a second
    // GIS request that would race the first.
    if (
      s.status === 'AUTHENTICATING' ||
      s.status === 'RECONNECTING' ||
      s.status === 'REFRESHING'
    ) {
      return new Promise<string | null>((resolve) => {
        set((st) => ({
          _waiters: [
            ...st._waiters,
            { resolve: () => resolve(get().accessToken ?? null), reject: () => resolve(null) }
          ]
        }));
      });
    }
    // Near expiry (or no token yet) — attempt a silent refresh. Carry the
    // login_hint for the same multi-account reason as the boot reconnect.
    if (!s._requestToken) return Promise.resolve(s.accessToken ?? null);
    const hint = s.user?.email || undefined;
    set({ status: 'REFRESHING', _silentRequestOutstanding: true });
    return new Promise<string | null>((resolve) => {
      set((st) => ({
        _waiters: [
          ...st._waiters,
          { resolve: () => resolve(get().accessToken ?? null), reject: () => resolve(null) }
        ]
      }));
      armAuthTimeout(AUTH_TIMEOUT_SILENT_MS);
      s._requestToken!({ prompt: '', ...(hint ? { hint } : {}) });
    });
  },

  markExpired: () => {
    const current = get().status;
    if (current === 'SESSION_EXPIRED') return;
    // S1/AUTH-04: never clobber an interactive sign-in. A Drive request issued
    // BEFORE the click comes back 401 — expected, it is what prompted the
    // sign-in — and this used to flip the store to SESSION_EXPIRED, empty
    // `_waiters` and push a second persistent notice while the popup was still
    // open. `signIn()`'s waiter resolves on both outcomes, so the caller saw a
    // "completed" sign-in; the real grant then arrived and `_onToken` dropped
    // it because the status was no longer in flight. A 401 about the OLD token
    // says nothing about the new one, so the right move is to ignore it: if the
    // interactive attempt fails, `_onError` reaches UNAUTHENTICATED anyway.
    if (current === 'AUTHENTICATING') {
      authDebug('[auth] markExpired ignored — an interactive sign-in is in flight');
      return;
    }
    clearAuthTimeout();
    const waiters = get()._waiters;
    set({ status: 'SESSION_EXPIRED', accessToken: null, expiresAt: null, _waiters: [], _absorbStaleError: false });
    // Settle in-flight waiters (a concurrent refresh) so nothing hangs.
    waiters.forEach((w) => w.reject());
    pushExpiredNotice(() => void get().signIn());
  },

  grantDriveAccess: () => {
    const { _requestToken, status } = get();
    if (!_requestToken) return;
    // prompt:'consent' forces Google to re-show the consent screen (with the
    // Drive checkbox) even though identity was already granted — incremental
    // re-consent, not a fresh account chooser. The grant lands in _onToken.
    // AUTH-02: derive `_absorbStaleError` the way `signIn()` does — this opens
    // the same kind of interactive request and is reachable with a silent one
    // still in flight.
    set({
      status: 'AUTHENTICATING',
      _absorbStaleError: supersedesSilentRequest(
        status,
        get()._silentRequestOutstanding
      )
    });
    armAuthTimeout(AUTH_TIMEOUT_INTERACTIVE_MS);
    _requestToken({ prompt: 'consent' });
  },

  markDriveScopeMissing: () => {
    if (get().status === 'DRIVE_ACCESS_REQUIRED') return;
    // S1/AUTH-01 + AUTH-12: this parks the session in exactly the state
    // `_onToken`'s scope-less hard stop does, and must leave the same trail.
    // It used to leave three:
    //  · `_waiters` undrained — every `getValidToken()` caller piggybacked on
    //    the in-flight refresh was parked forever (a late `_onToken`/`_onError`
    //    both bail on the status guard, and the 25 s timeout consults the same
    //    guard), so the awaiting Drive write hung with no error and no toast;
    //  · the timeout left armed against a request nothing will settle;
    //  · the profile hint left intact, so a reload was "remembered" and the
    //    boot reconnect walked straight back into the blocking dialog — the
    //    `_onToken` twin clears it for precisely that reason.
    clearAuthTimeout();
    clearProfileHint();
    const waiters = get()._waiters;
    set({
      status: 'DRIVE_ACCESS_REQUIRED',
      accessToken: null,
      expiresAt: null,
      driveScopeGranted: false,
      _waiters: [],
      _absorbStaleError: false
    });
    // Reject rather than resolve: a resolving piggybacker reads the just-nulled
    // `accessToken` and reports "Not signed in" (AUTH-06). Either way the
    // caller gets null — `request()` is what turns the null into a message, and
    // it consults the status to say "Drive access is required" instead.
    waiters.forEach((w) => w.reject());
  },

  _onToken: (resp) => {
    // Ignore a grant that arrives after the request was abandoned (signOut /
    // markExpired reset the status) — otherwise a late token would resurrect a
    // signed-out or expired session. A real grant only lands while a request we
    // initiated is in flight (AUTHENTICATING, RECONNECTING or REFRESHING).
    const s = get().status;
    if (s !== 'AUTHENTICATING' && s !== 'RECONNECTING' && s !== 'REFRESHING') return;
    clearAuthTimeout();
    const freshGrant = s === 'AUTHENTICATING' || s === 'RECONNECTING';
    const expiresAt = Date.now() + (resp.expires_in ?? 3600) * 1000;
    // Granular consent: the response's scope list is what the user really
    // granted, which may be less than what we asked for. No scope field
    // (older GIS shapes, tests) → assume granted rather than false-alarm.
    const driveScopeGranted = resp.scope ? resp.scope.split(' ').includes(DRIVE_FILE_SCOPE) : true;
    const waiters = get()._waiters;

    // Hard stop (ADR 0035 §6): drive.file is the ENTIRE point of signing in —
    // without it there is no storage to reach, only 403s. Identity without Drive
    // is never a usable session, however the token was obtained (interactive,
    // silent reconnect, or refresh): surface the ONE clear blocking re-consent
    // dialog rather than a confusing "signed out" avatar. Discard the scope-less
    // token, and stop remembering this account — an identity-only grant isn't
    // worth a boot reconnect, so a reload lands on a clean signed-out state
    // instead of looping back into this prompt.
    if (!driveScopeGranted) {
      authDebug('[auth] token granted WITHOUT drive.file scope:', resp.scope);
      clearProfileHint();
      set({
        status: 'DRIVE_ACCESS_REQUIRED',
        accessToken: null,
        expiresAt: null,
        driveScopeGranted: false,
        _waiters: [],
        _silentRequestOutstanding: false,
        _absorbStaleError: false
      });
      waiters.forEach((w) => w.resolve());
      // Use the identity token (valid for userinfo) to greet the user by name in
      // the dialog — but never persist it as a remember-me hint.
      if (!get().user) void fetchUserInfo(resp.access_token, false);
      return;
    }

    set({
      status: 'AUTHENTICATED',
      accessToken: resp.access_token,
      expiresAt,
      driveScopeGranted,
      _waiters: [],
      _silentRequestOutstanding: false,
      _absorbStaleError: false
    });
    waiters.forEach((w) => w.resolve());
    // Fresh grants re-fetch the profile (the popup may have picked a different
    // account than the hint); mid-session refreshes keep the live profile.
    if (freshGrant || !get().user) void fetchUserInfo(resp.access_token);
  },

  _onError: (reason) => {
    const s = get().status;
    // Ignore a late error after the request was abandoned (see _onToken).
    if (s !== 'AUTHENTICATING' && s !== 'RECONNECTING' && s !== 'REFRESHING') return;
    if (
      s === 'AUTHENTICATING' &&
      get()._absorbStaleError &&
      // AUTH-03: the safety-net timeout is not a GIS callback and must never be
      // absorbed — it IS the recovery from a request nothing else will settle.
      // Absorbing it left the store spinning in AUTHENTICATING forever (a bare
      // toolbar spinner, reload-only recovery): the absorb branch returns before
      // `clearAuthTimeout()`, and the timer callback had already nulled itself.
      !isTimeoutReason(reason)
    ) {
      // Late failure of the silent request this interactive sign-in superseded
      // — not the popup's own error. Absorb it once; the interactive attempt
      // stays in flight and its grant will land normally. This IS the callback
      // `_silentRequestOutstanding` was waiting for, so it is spent here.
      set({ _absorbStaleError: false, _silentRequestOutstanding: false });
      authDebug('[auth] absorbed superseded silent-request error:', reason);
      // …and give the request that IS still in flight its deadline back. The
      // absorbed error consumed nothing of the popup's own budget.
      rearmAuthTimeout();
      return;
    }
    clearAuthTimeout();
    const waiters = get()._waiters;
    set({ _waiters: [], _silentRequestOutstanding: false });
    if (s === 'REFRESHING') {
      authDebug('[auth] silent refresh failed:', reason);
      set({ status: 'SESSION_EXPIRED', accessToken: null, expiresAt: null });
      pushExpiredNotice(() => void get().signIn());
      waiters.forEach((w) => w.reject());
    } else if (s === 'RECONNECTING') {
      // Boot reconnect failed (cookie blocking, signed out of Google, popup
      // suppressed without a gesture). Expected — degrade QUIETLY: the avatar
      // shows the reconnect affordance; no toast, no popup. The debug line is
      // the diagnostic channel: GIS reports popup_failed_to_open (blocker) vs
      // an OAuth error like interaction_required (account chooser needed).
      authDebug('[auth] silent reconnect failed:', reason);
      set({ status: 'UNAUTHENTICATED', accessToken: null, expiresAt: null });
      waiters.forEach((w) => w.reject());
    } else {
      // S1/AUTH-11: a cancelled interactive request must not cost the user a
      // session that is still good. Reachable from the display gate's "use a
      // different Google account", which opens the chooser on top of a working
      // session — closing it without picking used to drop them to signed-out.
      const { accessToken, expiresAt } = get();
      const sessionSurvives = !!accessToken && !!expiresAt && expiresAt > Date.now();
      set({ status: sessionSurvives ? 'AUTHENTICATED' : 'UNAUTHENTICATED' });
      notificationStore.push({ severity: 'info', message: 'Sign-in cancelled' });
      waiters.forEach((w) => w.reject());
    }
    void reason;
  },

  _setUser: (user) => set({ user })
}));

/**
 * Fetch name/email/avatar once per grant. Non-fatal on failure. `persist`
 * controls the remember-me hint: a full grant saves it; an identity-only grant
 * (DRIVE_ACCESS_REQUIRED) uses the profile only to greet the user in the dialog
 * and passes persist=false so a reload doesn't reconnect to a useless account.
 */
async function fetchUserInfo(token: string, persist = true): Promise<void> {
  // S1/AUTH-05: a failure here is NOT cosmetic. `AuthControl` gates its whole
  // signed-in branch on `!!user`, so an authenticated, token-holding session
  // with no profile fell through to the "never signed in here" branch: no name,
  // no avatar, and — the part that matters — no Sign out item, while Drive saves
  // and opens kept working. The sign-out affordance must not depend on one
  // best-effort fetch, so a failure installs a placeholder identity instead.
  const placeholder = (): AuthUser => ({
    name: 'Google account',
    email: '',
    avatarUrl: ''
  });
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      if (!useAuthStore.getState().user) {
        useAuthStore.getState()._setUser(placeholder());
      }
      return;
    }
    const data = (await res.json()) as {
      name?: string;
      email?: string;
      picture?: string;
    };
    const user: AuthUser = {
      name: data.name || data.email || 'Google account',
      email: data.email || '',
      avatarUrl: data.picture || ''
    };
    // S1/AUTH-16 (the other half): switching account without a reload. The
    // per-account caches key off the Drive root, so a grant naming a DIFFERENT
    // email must invalidate them exactly as sign-out does.
    const previous = useAuthStore.getState().user;
    if (previous?.email && user.email && previous.email !== user.email) {
      fireSessionReset(`account changed (${previous.email} → ${user.email})`);
    }
    useAuthStore.getState()._setUser(user);
    // Remember-me: persist identity (never the token) so the next reload can
    // render the avatar immediately and attempt the silent reconnect. Skipped
    // for identity-only grants (see persist doc above), and — owner ruling
    // AUTH-13 — for a profile with no email, which is not a usable hint.
    if (persist) saveProfileHint(user);
  } catch {
    // Offline blip / CSP. Same reasoning as the !res.ok branch above: the
    // session is real, so it must render as one. The placeholder is in-memory
    // only — it is never written as a hint (AUTH-13).
    if (!useAuthStore.getState().user) {
      useAuthStore.getState()._setUser(placeholder());
    }
  }
}

/**
 * Imperative accessor for non-React modules (mirrors notificationStore). The
 * Drive provider reads the token exclusively through this.
 */
export const authStore = {
  getState: () => useAuthStore.getState(),
  signIn: () => useAuthStore.getState().signIn(),
  signOut: () => useAuthStore.getState().signOut(),
  getValidToken: () => useAuthStore.getState().getValidToken(),
  markExpired: () => useAuthStore.getState().markExpired(),
  markDriveScopeMissing: () => useAuthStore.getState().markDriveScopeMissing()
};
