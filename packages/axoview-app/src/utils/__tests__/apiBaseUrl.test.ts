/**
 * Promoted from the A5 explore lane (ADR 0047 flip rule) — A5/CHR-07.
 *
 * `apiBaseUrl()` identified the `npm run dev` split (SPA :3000 → backend :3001)
 * by sniffing `hostname === 'localhost' && port === '3000'`. The Docker
 * deployment the README documents matches that exactly — `compose.dev.yml`
 * publishes nginx as `"3000:80"` — so in the container every API call was
 * addressed cross-origin to :3001, bypassing the nginx proxy that fronts the
 * API and violating the app's own CSP (`connect-src 'self'`; a different port
 * is a different origin). Server storage appeared broken in the deployment the
 * docs tell people to use.
 *
 * The two cases are indistinguishable by ORIGIN, deliberately — the container
 * serves on the port developers expect. They are distinguishable by BUILD.
 */
import { apiBaseUrl } from '../apiBaseUrl';

const atOrigin = (hostname: string, port: string) => {
  const original = Object.getOwnPropertyDescriptor(window, 'location');
  Object.defineProperty(window, 'location', {
    value: { hostname, port },
    configurable: true
  });
  return () => {
    if (original) Object.defineProperty(window, 'location', original);
  };
};

const withNodeEnv = (value: string) => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = value;
  return () => {
    process.env.NODE_ENV = original;
  };
};

describe('apiBaseUrl — CHR-07', () => {
  it('a PRODUCTION build on localhost:3000 is same-origin (the Docker case)', () => {
    // The bug, stated: this exact origin used to return http://localhost:3001.
    const restoreEnv = withNodeEnv('production');
    const restoreLoc = atOrigin('localhost', '3000');
    try {
      expect(apiBaseUrl()).toBe('');
    } finally {
      restoreLoc();
      restoreEnv();
    }
  });

  it('CONTROL: a DEVELOPMENT build on localhost:3000 still gets the split', () => {
    // Without this the fix would read as "always same-origin", which breaks
    // `npm run dev` — the case the function exists for.
    const restoreEnv = withNodeEnv('development');
    const restoreLoc = atOrigin('localhost', '3000');
    try {
      expect(apiBaseUrl()).toBe('http://localhost:3001');
    } finally {
      restoreLoc();
      restoreEnv();
    }
  });

  it('a development build served from anywhere else is same-origin', () => {
    const restoreEnv = withNodeEnv('development');
    for (const [host, port] of [
      ['localhost', '3100'],
      ['127.0.0.1', '3000'],
      ['example.com', '']
    ]) {
      const restoreLoc = atOrigin(host, port);
      try {
        expect(apiBaseUrl()).toBe('');
      } finally {
        restoreLoc();
      }
    }
    restoreEnv();
  });

  it('a production build is same-origin everywhere', () => {
    const restoreEnv = withNodeEnv('production');
    for (const [host, port] of [
      ['localhost', '3000'],
      ['localhost', '8080'],
      ['axoview.example', '']
    ]) {
      const restoreLoc = atOrigin(host, port);
      try {
        expect(apiBaseUrl()).toBe('');
      } finally {
        restoreLoc();
      }
    }
    restoreEnv();
  });
});
