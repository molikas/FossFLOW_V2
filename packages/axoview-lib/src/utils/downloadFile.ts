/**
 * A5/CHR-11 — the ONE file-download helper.
 *
 * These eight lines existed five times (here, `app/utils/downloadBlob.ts`,
 * `LocalStorageInspector.exportAllDiagrams`, `DiagramLifecycleProvider`'s JSON
 * export and `DiagnosticsOverlay.downloadFile`), and every copy had the same
 * two faults:
 *
 *   - it revoked the object URL SYNCHRONOUSLY after `a.click()`. A browser that
 *     treats a revoked URL as a cancelled download produced no file, no error
 *     and no toast — the app's own "the click appeared to do nothing" class;
 *   - it never attached the anchor to the document, which some browsers require
 *     before a synthetic click on a download link does anything.
 *
 * So: append, click, remove, and revoke on a LATER TICK. The revoke still
 * happens — leaking the blob would hold the whole export in memory for the life
 * of the page — just not before the browser has read it.
 *
 * Lives in the lib and is re-exported for the app (ADR 0047 §3, the app/lib
 * dual-implementation class — here at five). The delay is a named constant
 * because "why 60 seconds" is the question a reader will have.
 */
const REVOKE_DELAY_MS = 60_000;

export const downloadFile = (data: Blob, filename: string) => {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // Some browsers ignore a synthetic click on a detached anchor.
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Long enough for even a slow disk to have started the write; short enough
  // that a page doing repeated exports does not accumulate blobs.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
};
