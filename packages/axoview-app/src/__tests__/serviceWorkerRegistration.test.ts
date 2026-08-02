/**
 * Promoted from the A5 explore lane (ADR 0047 flip rule) — A5/CHR-05.
 *
 * `index.tsx` ends every boot with `serviceWorkerRegistration.unregister()`.
 * That used to await `navigator.serviceWorker.ready`, which by spec resolves
 * ONLY when there is an active registration — it neither resolves nor rejects
 * when there is none. So on the overwhelmingly common case the chain never
 * settled, on every boot: harmless while nothing was sequenced after it, and a
 * permanent silent hang the day something was.
 *
 * The property under test is therefore "this promise SETTLES", which is why
 * every test awaits it. A test that only checked `unregister()` was called
 * would have passed against the broken version too, in the one case (an active
 * registration) where it worked.
 */
import { unregister } from '../serviceWorkerRegistration';

type SW = { getRegistrations?: unknown; ready?: unknown };

const withServiceWorker = (value: SW | undefined) => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  if (value === undefined) {
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  } else {
    Object.defineProperty(navigator, 'serviceWorker', {
      value,
      configurable: true
    });
  }
  return () => {
    if (original) Object.defineProperty(navigator, 'serviceWorker', original);
    else delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  };
};

/** Resolves true if `p` settles before the microtask queue drains. */
const settles = async (p: Promise<unknown>): Promise<boolean> => {
  const marker = Symbol('pending');
  return (await Promise.race([p, Promise.resolve(marker)])) !== marker;
};

describe('unregister — CHR-05', () => {
  it('SETTLES when there is no registration at all', async () => {
    // The case that never settled. `getRegistrations()` resolves to [];
    // `ready` would still be pending here.
    const restore = withServiceWorker({ getRegistrations: async () => [] });
    try {
      await expect(unregister()).resolves.toBeUndefined();
    } finally {
      restore();
    }
  });

  it('unregisters every registration it finds', async () => {
    const a = jest.fn(async () => true);
    const b = jest.fn(async () => true);
    const restore = withServiceWorker({
      getRegistrations: async () => [{ unregister: a }, { unregister: b }]
    });
    try {
      await unregister();
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });

  it('settles when the API is absent entirely', async () => {
    const restore = withServiceWorker(undefined);
    try {
      expect(await settles(unregister())).toBe(true);
    } finally {
      restore();
    }
  });

  it('a STRING rejection is logged as itself, not as `undefined`', async () => {
    // `.catch(e => console.error(e.message))` logged `undefined` for a string
    // rejection — a diagnostic that told you nothing at the moment you needed it.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const restore = withServiceWorker({
      getRegistrations: async () => {
        throw 'boom';
      }
    });
    try {
      await expect(unregister()).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledWith(expect.any(String), 'boom');
    } finally {
      restore();
      spy.mockRestore();
    }
  });

  it('a NULL rejection does not throw inside the handler', async () => {
    // `.message` on null threw, turning a diagnostic into a second failure —
    // an unhandled rejection during boot.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const restore = withServiceWorker({
      getRegistrations: async () => {
        throw null;
      }
    });
    try {
      await expect(unregister()).resolves.toBeUndefined();
    } finally {
      restore();
      spy.mockRestore();
    }
  });
});

describe('unregister — the CHR-05 probe caught this one', () => {
  it('settles when `serviceWorker` exists but has no getRegistrations', async () => {
    // Older Safari shipped `serviceWorker` without `getRegistrations`. Calling
    // it unguarded throws SYNCHRONOUSLY out of a boot path that previously only
    // hung — trading a silent stall for a visible crash is not the fix.
    const restore = withServiceWorker({ ready: new Promise(() => {}) });
    try {
      await expect(unregister()).resolves.toBeUndefined();
    } finally {
      restore();
    }
  });

  it('and does not touch `ready`, which is the promise that never settles', async () => {
    let readyTouched = false;
    const restore = withServiceWorker({
      get ready() {
        readyTouched = true;
        return new Promise(() => {});
      },
      getRegistrations: async () => []
    });
    try {
      await unregister();
      expect(readyTouched).toBe(false);
    } finally {
      restore();
    }
  });
});
