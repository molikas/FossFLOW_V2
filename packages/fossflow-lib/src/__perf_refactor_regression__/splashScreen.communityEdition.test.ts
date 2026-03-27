/**
 * REGRESSION — Splash screen: community edition branding
 *
 * The welcome notification (LazyLoadingWelcomeNotification) was updated from
 * the original "New Feature: Lazy Loading!" message to community-edition branding
 * pointing users to the fork repository and GitHub issues.
 *
 * This test pins the required content in the en-US locale so the messaging
 * cannot silently revert to the original upstream text.
 */

import * as fs from 'fs';
import * as path from 'path';

const LOCALE_PATH = path.resolve(__dirname, '../i18n/en-US.ts');

describe('Splash screen — community edition branding (en-US)', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(LOCALE_PATH, 'utf-8');
  });

  it('en-US.ts exists', () => {
    expect(fs.existsSync(LOCALE_PATH)).toBe(true);
  });

  it('title refers to Community Edition', () => {
    expect(src).toContain('Community Edition');
  });

  it('message references the fork repository URL', () => {
    expect(src).toContain('github.com/molikas/FossFLOW_V2');
  });

  it('signature credits the community', () => {
    expect(src).toContain('Community');
  });

  it('original upstream title has been replaced', () => {
    expect(src).not.toContain('New Feature: Lazy Loading!');
  });

  it('original Stan signature has been replaced', () => {
    expect(src).not.toMatch(/["']-Stan["']/);
  });
});
