import { getConfig } from '../routes.js';
import { makeCtx } from './helpers/memoryAdapter.js';

describe('getConfig', () => {
  test('returns documented shape with defaults when env is empty', () => {
    const result = getConfig(null, makeCtx({ env: {} }));
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      googleClientId: null,
      drivePublicPreview: false,
      googleProjectNumber: null,
      driveScopes: ['https://www.googleapis.com/auth/drive.file'],
      authMode: 'none',
      serverStorage: true,
      publicBaseUrl: null
    });
  });

  // A5/CHR-08 (owner ruling 2026-07-30): the client's own link builders resolve
  // against this when the operator configures one, so a preview/staging/LAN
  // origin cannot leak into a durable share link. Null keeps the page origin.
  test('surfaces PUBLIC_BASE_URL so the app can mint canonical links', () => {
    const result = getConfig(
      null,
      makeCtx({ env: { PUBLIC_BASE_URL: 'https://diagrams.example.com' } })
    );
    expect(result.body.publicBaseUrl).toBe('https://diagrams.example.com');
  });

  test('reflects GOOGLE_CLIENT_ID + AUTH_MODE from env', () => {
    const result = getConfig(
      null,
      makeCtx({
        env: { GOOGLE_CLIENT_ID: 'client-123', AUTH_MODE: 'shared-token' }
      })
    );
    expect(result.body.googleClientId).toBe('client-123');
    expect(result.body.authMode).toBe('shared-token');
  });

  test('drivePublicPreview is always false (no proxy on Docker/Express) + no raw key surfaced (ADR 0042 §8)', () => {
    const result = getConfig(
      null,
      makeCtx({
        env: { GOOGLE_API_KEY: 'AIza-test-key', GOOGLE_PROJECT_NUMBER: '123456789012' }
      })
    );
    expect(result.body.drivePublicPreview).toBe(false);
    expect(result.body.googleApiKey).toBeUndefined();
    expect(result.body.googleProjectNumber).toBe('123456789012');
  });

  test('serverStorage is true unless STORAGE_ENABLED is explicitly false', () => {
    expect(getConfig(null, makeCtx({ env: { STORAGE_ENABLED: false } })).body.serverStorage).toBe(false);
    expect(getConfig(null, makeCtx({ env: { STORAGE_ENABLED: true } })).body.serverStorage).toBe(true);
    expect(getConfig(null, makeCtx({ env: {} })).body.serverStorage).toBe(true);
  });

  test('survives null ctx', () => {
    const result = getConfig(null, null);
    expect(result.status).toBe(200);
    expect(result.body.authMode).toBe('none');
  });
});
