/**
 * Promoted from the A5 explore lane (ADR 0047 flip rule) — A5/CHR-11.
 *
 * These eight lines existed FIVE times (here, `app/utils/downloadBlob.ts`,
 * `LocalStorageInspector.exportAllDiagrams`, `DiagramLifecycleProvider`'s JSON
 * export and `DiagnosticsOverlay.downloadFile`) — the ADR 0047 "app/lib dual
 * implementations of one contract" class, at five. Every copy revoked the
 * object URL synchronously after `a.click()`, which on browsers that treat a
 * revoked URL as a cancelled download produced no file, no error and no toast:
 * the app's own "the click appeared to do nothing" class, in the four surfaces
 * users reach for when they want their work OUT.
 */
import { downloadFile } from '../downloadFile';

// jsdom implements neither `URL.createObjectURL` nor `revokeObjectURL`, so
// these are DEFINED rather than spied on — `jest.spyOn` refuses a property that
// does not exist, and silently stubbing it would be worse.
type UrlWithObjectUrls = typeof URL & {
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
};

describe('downloadFile — the single implementation (CHR-11)', () => {
  let createSpy: jest.Mock;
  let revokeSpy: jest.Mock;
  let clickSpy: jest.SpyInstance;
  let hadCreate: boolean;
  let hadRevoke: boolean;

  beforeEach(() => {
    jest.useFakeTimers();
    const url = URL as UrlWithObjectUrls;
    hadCreate = typeof url.createObjectURL === 'function';
    hadRevoke = typeof url.revokeObjectURL === 'function';
    createSpy = jest.fn(() => 'blob:fake-url');
    revokeSpy = jest.fn();
    url.createObjectURL = createSpy as unknown as (blob: Blob) => string;
    url.revokeObjectURL = revokeSpy as unknown as (u: string) => void;
    clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        // Assert AT CLICK TIME — the whole bug is that by the time the browser
        // read the URL it had already been revoked.
        expect(revokeSpy).not.toHaveBeenCalled();
        // …and that the anchor is in the document, which some browsers require
        // before a synthetic click on a download link does anything.
        expect(this.isConnected).toBe(true);
      });
  });

  afterEach(() => {
    jest.useRealTimers();
    const url = URL as unknown as Record<string, unknown>;
    if (!hadCreate) delete url.createObjectURL;
    if (!hadRevoke) delete url.revokeObjectURL;
    clickSpy.mockRestore();
  });

  it('clicks an attached anchor with the URL still live', () => {
    downloadFile(new Blob(['payload']), 'export.json');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('sets href and the download filename', () => {
    let seen: { href: string; download: string } | null = null;
    clickSpy.mockImplementation(function (this: HTMLAnchorElement) {
      seen = { href: this.href, download: this.download };
    });
    downloadFile(new Blob(['payload']), 'my-diagram.json');
    expect(seen).toEqual({ href: 'blob:fake-url', download: 'my-diagram.json' });
  });

  it('revokes on a LATER TICK, not synchronously', () => {
    downloadFile(new Blob(['payload']), 'export.json');
    expect(revokeSpy).not.toHaveBeenCalled();
    jest.runAllTimers();
    expect(revokeSpy).toHaveBeenCalledWith('blob:fake-url');
  });

  it('still revokes — a leak would hold the whole export for the page lifetime', () => {
    // The opposite failure: "never revoke" would also pass the test above.
    downloadFile(new Blob(['payload']), 'export.json');
    jest.runAllTimers();
    expect(revokeSpy).toHaveBeenCalledTimes(1);
  });

  it('leaves no anchor behind in the document', () => {
    const before = document.querySelectorAll('a').length;
    downloadFile(new Blob(['payload']), 'export.json');
    expect(document.querySelectorAll('a').length).toBe(before);
  });
});
