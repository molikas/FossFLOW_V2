/**
 * Success message for a top-level project-zip import: "Imported N diagrams
 * across M folders at the top level" (folder clause omitted when none).
 *
 * A3/ZIP-05: the counts must come from what `importProject` actually created,
 * not from what the manifest CLAIMED — the two diverge whenever an entry is
 * skipped, and the toast used to report the claim. `claimedDiagramCount` is
 * passed so the gap can be named instead of silently rounded away.
 */
export function buildZipImportSummary(
  diagramCount: number,
  folderCount: number,
  claimedDiagramCount: number = diagramCount
): string {
  const parts = [`${diagramCount} diagram${diagramCount !== 1 ? 's' : ''}`];
  if (folderCount > 0) {
    parts.push(`${folderCount} folder${folderCount !== 1 ? 's' : ''}`);
  }
  const summary = `Imported ${parts.join(' across ')} at the top level`;
  const missing = claimedDiagramCount - diagramCount;
  return missing > 0
    ? `${summary} — ${missing} diagram${missing !== 1 ? 's' : ''} in the archive could not be imported`
    : summary;
}
