import type { IconUsageReport } from 'axoview';
import type { StorageProvider } from './storage/types';

/**
 * Workspace-wide scan: which diagrams reference this icon id, and how many
 * times each. Used by the imported-icon delete confirm flow (ADR-0002
 * lifecycle section).
 *
 * The active diagram's *in-memory* items are preferred over its stored copy
 * so unsaved changes show up correctly. The caller passes them in via
 * `currentDiagramItems` together with the current diagram id.
 *
 * Soft-deleted diagrams are skipped — they aren't visible to the user, so
 * surfacing their counts would only confuse the warning. Hard delete or
 * undelete will surface them again on the next call.
 */
export interface ScanArgs {
  storage: StorageProvider;
  iconId: string;
  currentDiagramId: string | null;
  currentDiagramName: string | null;
  currentDiagramItems: Array<{ icon?: string }> | null;
}

const countRefs = (items: Array<{ icon?: string }>, iconId: string): number =>
  items.reduce((n, it) => (it.icon === iconId ? n + 1 : n), 0);

export async function scanIconUsage(args: ScanArgs): Promise<IconUsageReport[]> {
  const { storage, iconId, currentDiagramId, currentDiagramName, currentDiagramItems } = args;
  const results: IconUsageReport[] = [];

  // Current diagram first — use in-memory items so unsaved edits count.
  if (currentDiagramId && currentDiagramItems) {
    const count = countRefs(currentDiagramItems, iconId);
    if (count > 0) {
      results.push({
        diagramId: currentDiagramId,
        diagramName: currentDiagramName ?? 'Current diagram',
        count
      });
    }
  }

  // All other diagrams via storage. listDiagrams() can include soft-deleted
  // entries; filter them out so the warning only mentions diagrams the user
  // can actually navigate to.
  let metas;
  try {
    metas = await storage.listDiagrams();
  } catch (e) {
    console.error('[scanIconUsage] listDiagrams failed:', e);
    return results;
  }

  // F5/ICON-06 — the TRASH is scanned too.
  //
  // This used to be `!m.deletedAt && m.id !== currentDiagramId`, with a comment
  // explaining that surfacing a trashed diagram's counts "would only confuse the
  // warning". That is right for a usage REPORT and wrong for a DELETE GATE: a
  // trashed diagram is restorable, so its reference is live, and deleting the
  // icon left it resolving to nothing on restore — which nothing downstream
  // catches, because an unknown icon reference passes both the schema and
  // `validateView` (E4/CLIP-14).
  //
  // Same shape as S2/SHARE-06 (trashing a shared diagram left its public link
  // live): a soft delete hides a row from one query and the row keeps mattering
  // somewhere else. The answer is not to hide it from this one too — it is to
  // return it LABELLED, so the count is honest and the dialog can say where the
  // use is.
  const candidates = metas.filter((m) => m.id !== currentDiagramId);

  // Sequential loads keep memory bounded and avoid hammering storage. For the
  // typical session (~tens of diagrams) this is well under a second.
  for (const meta of candidates) {
    try {
      const raw = (await storage.loadDiagram(meta.id)) as
        | { items?: Array<{ icon?: string }> }
        | null
        | undefined;
      const items = raw?.items;
      if (!Array.isArray(items)) continue;
      const count = countRefs(items, iconId);
      if (count > 0) {
        results.push({
          diagramId: meta.id,
          diagramName: meta.name,
          count,
          ...(meta.deletedAt ? { inTrash: true } : {})
        });
      }
    } catch (e) {
      console.warn(`[scanIconUsage] failed to load diagram ${meta.id}:`, e);
    }
  }

  return results;
}
