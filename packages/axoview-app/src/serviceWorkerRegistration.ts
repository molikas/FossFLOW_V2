// Axoview does not ship a service worker; the public/service-worker.js asset
// was removed during the PWA-out work. This helper only unregisters any
// service worker left over from a prior install so returning users don't get
// stuck on cached assets.
/**
 * A5/CHR-05 — `getRegistrations()`, not `ready`.
 *
 * `navigator.serviceWorker.ready` resolves only when there IS an active
 * registration; by spec it neither resolves nor rejects when there is none. So
 * on the overwhelmingly common case — no service worker — the old promise chain
 * never settled, on every boot. Harmless while nothing was sequenced after it,
 * and a permanent silent hang the day something was: a cleanup, a telemetry
 * ping, an `await` added in a future refactor.
 *
 * `getRegistrations()` is the API that answers the question actually being
 * asked ("is there anything to unregister?") and resolves to `[]` when there is
 * not. It also covers a registration that exists but is not yet ACTIVE, which
 * `ready` would have waited on indefinitely.
 *
 * Returns the promise, so a caller CAN await it — that it is now safe to do so
 * is the point of the fix.
 */
export function unregister(): Promise<void> {
  if (!('serviceWorker' in navigator)) return Promise.resolve();
  // `getRegistrations` is not universal (older Safari shipped `serviceWorker`
  // without it). Calling it unguarded would throw SYNCHRONOUSLY out of a boot
  // path that previously only hung — trading a silent stall for a visible crash
  // is not the fix. The CHR-05 probe caught exactly this by stubbing a
  // `serviceWorker` that has only `ready`.
  const container = navigator.serviceWorker as ServiceWorkerContainer & {
    getRegistrations?: () => Promise<readonly ServiceWorkerRegistration[]>;
  };
  if (typeof container.getRegistrations !== 'function') {
    return Promise.resolve();
  }
  return container
    .getRegistrations()
    .then((registrations) =>
      Promise.all(registrations.map((r) => r.unregister()))
    )
    .then(() => undefined)
    .catch((error) => {
      // Log the VALUE, not `error.message`: a string rejection logged
      // `undefined`, and a null/undefined rejection threw inside the handler —
      // turning a diagnostic into a second failure.
      console.error('[Axoview] service worker cleanup failed:', error);
    });
}
