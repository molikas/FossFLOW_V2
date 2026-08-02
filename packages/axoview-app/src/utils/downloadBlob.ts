import { downloadFile } from 'axoview';

/**
 * A5/CHR-11 — a thin alias over the lib's single implementation, kept so the
 * app's existing call sites do not all have to change import path in the same
 * commit that fixes the behaviour.
 *
 * There is exactly one implementation now (`axoview-lib/src/utils/exportOptions.ts`).
 * The four copies that used to live in the app — here, `LocalStorageInspector`,
 * `DiagramLifecycleProvider`'s JSON export and `DiagnosticsOverlay` — every one
 * of them revoked the object URL synchronously after `click()`, which on some
 * browsers cancels the download and produces nothing at all.
 */
export const downloadBlob = (blob: Blob, filename: string): void => {
  downloadFile(blob, filename);
};
