// One-shot migration of pre-rename localStorage / sessionStorage keys.
//
// Before the FossFLOW → Axoview rename, persisted browser state used the
// "fossflow_" / "fossflow-" prefix. New code reads/writes "axoview_" /
// "axoview-". Without this shim, every existing user would appear to lose
// their diagrams on first launch after upgrade.
//
// Idempotent: runs at most once per browser profile, gated by the sentinel
// localStorage key MIGRATION_SENTINEL_KEY.

const MIGRATION_SENTINEL_KEY = 'axoview_migration_v1';
const MIGRATION_SENTINEL_VALUE = 'done';

const renamePrefix = (oldKey: string): string | null => {
  if (oldKey.startsWith('fossflow_')) return 'axoview_' + oldKey.slice('fossflow_'.length);
  if (oldKey.startsWith('fossflow-')) return 'axoview-' + oldKey.slice('fossflow-'.length);
  return null;
};

const migrateStorage = (storage: Storage): number => {
  let migrated = 0;
  const oldKeys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && (k.startsWith('fossflow_') || k.startsWith('fossflow-'))) {
      oldKeys.push(k);
    }
  }
  for (const oldKey of oldKeys) {
    const newKey = renamePrefix(oldKey);
    if (!newKey) continue;
    const value = storage.getItem(oldKey);
    if (value !== null && storage.getItem(newKey) === null) {
      storage.setItem(newKey, value);
      migrated++;
    }
    storage.removeItem(oldKey);
  }
  return migrated;
};

export interface MigrationResult {
  ran: boolean;
  /**
   * A5/CHR-06 — whether every pass finished without throwing. The sentinel is
   * written only when this is true, so a partial run is retried on the next
   * boot instead of being recorded as done. `false` on a skipped run (`ran:
   * false`) means nothing was attempted, not that something failed.
   */
  complete: boolean;
  localMigrated: number;
  sessionMigrated: number;
}

export const migrateFossflowStorageKeys = (): MigrationResult => {
  if (typeof window === 'undefined') {
    return { ran: false, complete: true, localMigrated: 0, sessionMigrated: 0 };
  }

  try {
    if (localStorage.getItem(MIGRATION_SENTINEL_KEY) === MIGRATION_SENTINEL_VALUE) {
      return { ran: false, complete: true, localMigrated: 0, sessionMigrated: 0 };
    }
  } catch {
    // localStorage unavailable (private browsing, blocked) — nothing we can do
    return { ran: false, complete: true, localMigrated: 0, sessionMigrated: 0 };
  }

  let localMigrated = 0;
  let sessionMigrated = 0;
  // A5/CHR-06 — the sentinel means "there is nothing left to migrate", and it
  // may only be written when that is TRUE.
  //
  // Both passes used to be wrapped in `try {} catch {}` ("skip — best effort")
  // and the sentinel written unconditionally afterwards. A QuotaExceededError
  // partway through the key loop therefore ended as `{ ran: true }` with legacy
  // keys still in place, and every later boot short-circuited on the sentinel:
  // half the user's data present in the profile and invisible to the app,
  // permanently. And it lands on exactly the user with the most legacy data —
  // an upgrade on a nearly-full profile.
  //
  // The sentinel's own catch already reasoned about this correctly ("can't set
  // sentinel; migration will retry next boot"); the migration body did not.
  let complete = true;

  try {
    localMigrated = migrateStorage(localStorage);
  } catch {
    complete = false;
  }
  try {
    sessionMigrated = migrateStorage(sessionStorage);
  } catch {
    complete = false;
  }

  // Both passes still ATTEMPTED even if the first throws: a quota failure in
  // one store says nothing about the other, and migrating what can be migrated
  // is strictly better than stopping — the retry picks up the rest.
  if (complete) {
    try {
      localStorage.setItem(MIGRATION_SENTINEL_KEY, MIGRATION_SENTINEL_VALUE);
    } catch {
      // can't set sentinel; migration will retry next boot (idempotent)
    }
  }

  return { ran: true, complete, localMigrated, sessionMigrated };
};
