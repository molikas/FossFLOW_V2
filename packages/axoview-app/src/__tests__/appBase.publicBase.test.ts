/**
 * appBase.publicBase.test.ts — A5/CHR-08 (owner ruling 2026-07-30).
 *
 * Every share link the app mints resolves through `appDisplayBase()`. It was
 * anchored to `window.location.origin` — which fixed the earlier bug where the
 * BACKEND-derived host produced links the recipient could not open — but that
 * also means a preview, staging or LAN origin leaks into a link that outlives
 * the session which minted it. The ruling: an optional configured public base
 * wins when set, the page origin remains the fallback, and both link builders
 * (public-snapshot `shareUrl.ts`, Drive `driveSharing.ts`) inherit it.
 */
import {
  appDisplayBase,
  setConfiguredPublicBase,
  getConfiguredPublicBase,
  APP_BASENAME
} from '../appBase';
import { shareUrlFromUuid } from '../utils/shareUrl';
import { drivePreviewUrl } from '../services/drive/driveSharing';

afterEach(() => setConfiguredPublicBase(null));

describe('appDisplayBase', () => {
  test('falls back to the page origin when nothing is configured', () => {
    setConfiguredPublicBase(null);
    expect(appDisplayBase()).toBe(
      `${window.location.origin}${APP_BASENAME}/display`
    );
  });

  test('uses the configured base when one is set', () => {
    setConfiguredPublicBase('https://diagrams.example.com');
    expect(appDisplayBase()).toBe(
      `https://diagrams.example.com${APP_BASENAME}/display`
    );
  });

  test('normalises trailing slashes so the two halves never double up', () => {
    setConfiguredPublicBase('https://diagrams.example.com///');
    expect(getConfiguredPublicBase()).toBe('https://diagrams.example.com');
    expect(appDisplayBase()).not.toContain('//app');
  });

  test.each([null, undefined, '', '   '])(
    'treats %p as "not configured"',
    (value) => {
      setConfiguredPublicBase(value as string | null | undefined);
      expect(getConfiguredPublicBase()).toBeNull();
      expect(appDisplayBase()).toContain(window.location.origin);
    }
  );
});

describe('both link builders inherit it', () => {
  test('the public-snapshot link', () => {
    setConfiguredPublicBase('https://diagrams.example.com');
    expect(shareUrlFromUuid('abc123')).toBe(
      `https://diagrams.example.com${APP_BASENAME}/display/p/abc123`
    );
  });

  test('the Drive preview link', () => {
    setConfiguredPublicBase('https://diagrams.example.com');
    expect(drivePreviewUrl('file-1')).toBe(
      `https://diagrams.example.com${APP_BASENAME}/display/drive/file-1`
    );
  });

  test('…and both fall back together', () => {
    setConfiguredPublicBase(null);
    expect(shareUrlFromUuid('abc123')).toContain(window.location.origin);
    expect(drivePreviewUrl('file-1')).toContain(window.location.origin);
  });
});
