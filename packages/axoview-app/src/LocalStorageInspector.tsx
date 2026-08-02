import React, { useState, useEffect, useCallback } from 'react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { useAppStorage } from './providers/AppStorageContext';
import { notificationStore } from './stores/notificationStore';
import { downloadBlob } from './utils/downloadBlob';
import {
  measureStorage,
  estimateQuota,
  clearableDiagramKeys,
  FALLBACK_QUOTA_BYTES,
  type StorageBreakdown
} from './services/storage/storageAccounting';

/**
 * The quota-full escape hatch. Every A5/CHR-01..04 symptom came from this
 * component predating the places model (2026-07-06) and never being re-pointed:
 * it reasoned about ONE store with ONE prefix, while the app uses two of each,
 * differing by a single character. Session-place DIAGRAMS live in
 * `sessionStorage` under `axoview_` (underscore); CONFIGURATION lives in
 * `localStorage` under `axoview-` (hyphen). Taking the second set for the first
 * is the whole cluster — see `services/storage/storageAccounting.ts`.
 */
export const LocalStorageInspector: React.FC<{ onClose: () => void }> = ({
  onClose
}) => {
  const [storageInfo, setStorageInfo] = useState<StorageBreakdown>({
    diagrams: 0,
    config: 0,
    other: 0,
    total: 0
  });
  const [quota, setQuota] = useState<{ quota: number; estimated: boolean }>({
    quota: FALLBACK_QUOTA_BYTES,
    estimated: false
  });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const { storageManager } = useAppStorage();
  const sessionProvider = storageManager?.getProvider('local') ?? null;

  const calculateStorage = useCallback(() => {
    // A5/CHR-02: both stores, bucketed by the REAL key sets. The old version
    // walked localStorage only and called every `axoview-` key a diagram, so
    // the line the user acts on measured PREFERENCES — bytes, next to a
    // workspace holding tens of kilobytes of diagrams it never saw.
    setStorageInfo(measureStorage(localStorage, sessionStorage));
  }, []);

  useEffect(() => {
    calculateStorage();
    // The 5 MB denominator was a guess about ONE store, while the quota error
    // that opens this dialog can come from either.
    void estimateQuota().then(setQuota);
  }, [calculateStorage]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.min(
      Math.floor(Math.log(bytes) / Math.log(k)),
      sizes.length - 1
    );
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const clearOldDiagrams = () => {
    setShowClearConfirm(true);
  };

  /**
   * A5/CHR-01 + CHR-03 — delete the DIAGRAMS, through the provider, and never
   * touch configuration.
   *
   * The old sweep removed every `axoview-` key: the Google profile hint, the
   * Drive root cache, the icon-pack preference, the last-opened pointer, the
   * tree manifest — and the FOLDERS, while every diagram kept its `folderId`.
   * That made the work invisible rather than deleted (A4/FEX-01's shape,
   * wholesale) and freed nothing, because the diagrams were in the other store
   * the whole time.
   *
   * Through the provider so the diagram index and the folder tree stay
   * coherent; the raw-key path is a fallback for when no provider is reachable.
   */
  const confirmClear = useCallback(async () => {
    setShowClearConfirm(false);
    setBusy(true);
    try {
      if (sessionProvider) {
        const metas = await sessionProvider.listDiagrams();
        for (const meta of metas) {
          await sessionProvider.deleteDiagram(meta.id, false);
        }
      } else {
        for (const key of clearableDiagramKeys(sessionStorage)) {
          sessionStorage.removeItem(key);
        }
      }
      calculateStorage();
      notificationStore.push({
        severity: 'success',
        message: 'All session diagrams deleted'
      });
      // Deliberately no `window.location.reload()`: the old one made the action
      // irreversible-looking and hid whether anything had happened at all.
    } catch {
      notificationStore.push({
        severity: 'error',
        message: 'Could not delete every diagram — some may remain'
      });
      calculateStorage();
    } finally {
      setBusy(false);
    }
  }, [sessionProvider, calculateStorage]);

  /**
   * A5/CHR-04 — the backup offered beside the destructive clear is a real one.
   *
   * It used to read `localStorage['axoview-diagrams']`, a pre-places-model key
   * written only by a legacy session-mode effect: normally absent, so the click
   * produced no file, no error and no toast — and when present, it exported a
   * stale copy rather than the current workspace. Routed through the provider
   * now, which is where the diagrams actually are.
   */
  const exportAllDiagrams = useCallback(async () => {
    setBusy(true);
    try {
      if (!sessionProvider) throw new Error('no session provider');
      const metas = await sessionProvider.listDiagrams();
      if (metas.length === 0) {
        notificationStore.push({
          severity: 'info',
          message: 'No session diagrams to export'
        });
        return;
      }
      const diagrams = [];
      for (const meta of metas) {
        diagrams.push({ meta, data: await sessionProvider.loadDiagram(meta.id) });
      }
      downloadBlob(
        new Blob([JSON.stringify({ version: 1, diagrams }, null, 2)], {
          type: 'application/json'
        }),
        `axoview-backup-${new Date().toISOString().slice(0, 10)}.json`
      );
      notificationStore.push({
        severity: 'success',
        message: `Exported ${metas.length} diagram${metas.length === 1 ? '' : 's'}`
      });
    } catch {
      // Silence is what made the original a trap: the user takes the backup,
      // sees nothing, and clears anyway.
      notificationStore.push({
        severity: 'error',
        message: 'Export failed — do not clear until you have a backup'
      });
    } finally {
      setBusy(false);
    }
  }, [sessionProvider]);

  const storagePercentage = (storageInfo.total / quota.quota) * 100;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1001
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: '30px',
          borderRadius: '8px',
          maxWidth: '500px',
          width: '90%'
        }}
      >
        <h2 style={{ marginTop: 0 }}>Storage Manager</h2>

        <div style={{ marginBottom: '20px' }}>
          <h3>Storage Usage</h3>
          <div
            style={{
              backgroundColor: '#e0e0e0',
              borderRadius: '4px',
              height: '20px',
              overflow: 'hidden',
              marginBottom: '10px'
            }}
          >
            <div
              style={{
                backgroundColor:
                  storagePercentage > 80
                    ? '#f44336'
                    : storagePercentage > 60
                      ? '#ff9800'
                      : '#4caf50',
                height: '100%',
                width: `${Math.min(storagePercentage, 100)}%`,
                transition: 'width 0.3s'
              }}
            />
          </div>
          <p>
            Used: {formatBytes(storageInfo.total)} /{' '}
            {quota.estimated ? '' : '~'}
            {formatBytes(quota.quota)} ({storagePercentage.toFixed(1)}%)
          </p>
          <ul style={{ fontSize: '14px' }}>
            {/* Named for what each figure IS. "Axoview diagrams" over the
                configuration bytes is what made the old dialog actively
                misleading at the moment the user had to decide what to
                delete. */}
            <li>Session diagrams: {formatBytes(storageInfo.diagrams)}</li>
            <li>Axoview settings and folders: {formatBytes(storageInfo.config)}</li>
            <li>Other site data: {formatBytes(storageInfo.other)}</li>
          </ul>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h3>Actions</h3>
          <button
            onClick={() => void exportAllDiagrams()}
            disabled={busy}
            data-axoview-id="storage-export-all"
            style={{
              padding: '10px 20px',
              marginRight: '10px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Export All Diagrams
          </button>
          <button
            onClick={clearOldDiagrams}
            disabled={busy}
            data-axoview-id="storage-clear-all"
            style={{
              padding: '10px 20px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Clear All Diagrams
          </button>
        </div>

        <div
          style={{
            backgroundColor: '#f8f9fa',
            padding: '15px',
            borderRadius: '4px',
            marginBottom: '20px',
            fontSize: '14px'
          }}
        >
          <strong>Tips to save space:</strong>
          <ul style={{ marginBottom: 0 }}>
            <li>Export diagrams you don't need immediately</li>
            <li>Delete old versions of diagrams</li>
            <li>Clear browser cache if needed</li>
          </ul>
        </div>

        <button
          onClick={onClose}
          style={{
            padding: '10px 20px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            width: '100%'
          }}
        >
          Close
        </button>
      </div>

      <ConfirmDialog
        open={showClearConfirm}
        // Says what it does now. The old copy promised "all saved diagrams"
        // and delivered the opposite set.
        message="This will delete every diagram stored in this browser session. Your folders, settings and Google Drive diagrams are not affected. Are you sure?"
        onConfirm={() => void confirmClear()}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
};
