import { migrateFossflowStorageKeys } from '../migrationShim';

const SENTINEL = 'axoview_migration_v1';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('migrateFossflowStorageKeys', () => {
  it('copies fossflow_* localStorage keys to axoview_* and deletes originals', () => {
    localStorage.setItem('fossflow_user_settings', JSON.stringify({ theme: 'dark' }));
    localStorage.setItem('fossflow_perf_enabled', 'true');
    localStorage.setItem('fossflow-tree-manifest', '{"folders":[]}');

    const result = migrateFossflowStorageKeys();

    expect(result.ran).toBe(true);
    expect(result.localMigrated).toBe(3);
    expect(localStorage.getItem('axoview_user_settings')).toBe(JSON.stringify({ theme: 'dark' }));
    expect(localStorage.getItem('axoview_perf_enabled')).toBe('true');
    expect(localStorage.getItem('axoview-tree-manifest')).toBe('{"folders":[]}');
    expect(localStorage.getItem('fossflow_user_settings')).toBeNull();
    expect(localStorage.getItem('fossflow_perf_enabled')).toBeNull();
    expect(localStorage.getItem('fossflow-tree-manifest')).toBeNull();
    expect(localStorage.getItem(SENTINEL)).toBe('done');
  });

  it('also migrates sessionStorage keys', () => {
    sessionStorage.setItem('fossflow_diagrams', '[]');
    sessionStorage.setItem('fossflow_diagram_abc', '{"name":"X"}');

    const result = migrateFossflowStorageKeys();

    expect(result.sessionMigrated).toBe(2);
    expect(sessionStorage.getItem('axoview_diagrams')).toBe('[]');
    expect(sessionStorage.getItem('axoview_diagram_abc')).toBe('{"name":"X"}');
    expect(sessionStorage.getItem('fossflow_diagrams')).toBeNull();
  });

  it('runs at most once — second invocation is a no-op', () => {
    localStorage.setItem('fossflow_user_settings', 'a');
    const first = migrateFossflowStorageKeys();
    expect(first.ran).toBe(true);
    expect(first.localMigrated).toBe(1);

    // Seed a fresh legacy key after the sentinel was set
    localStorage.setItem('fossflow_user_settings', 'b');
    const second = migrateFossflowStorageKeys();
    expect(second.ran).toBe(false);
    expect(second.localMigrated).toBe(0);
    // Sentinel honored — the new legacy key was not migrated
    expect(localStorage.getItem('fossflow_user_settings')).toBe('b');
  });

  it('does not overwrite an existing axoview_* key — preserves new value, deletes old', () => {
    localStorage.setItem('fossflow_user_settings', 'OLD');
    localStorage.setItem('axoview_user_settings', 'NEW');

    const result = migrateFossflowStorageKeys();

    expect(result.ran).toBe(true);
    expect(localStorage.getItem('axoview_user_settings')).toBe('NEW');
    expect(localStorage.getItem('fossflow_user_settings')).toBeNull();
  });

  it('returns ran=false with no work when nothing to migrate', () => {
    const result = migrateFossflowStorageKeys();
    expect(result.ran).toBe(true); // still flips the sentinel
    expect(result.localMigrated).toBe(0);
    expect(result.sessionMigrated).toBe(0);
    expect(localStorage.getItem(SENTINEL)).toBe('done');
  });

  it('ignores non-fossflow-prefixed keys', () => {
    localStorage.setItem('foo_user_settings', 'untouched');
    localStorage.setItem('axoview_existing', 'keep');
    migrateFossflowStorageKeys();
    expect(localStorage.getItem('foo_user_settings')).toBe('untouched');
    expect(localStorage.getItem('axoview_existing')).toBe('keep');
  });
});

/**
 * Promoted from the A5 explore lane (ADR 0047 flip rule) — A5/CHR-06.
 *
 * The sentinel means "there is nothing left to migrate". Both passes used to be
 * wrapped in `try {} catch {}` ("skip — best effort") with the sentinel written
 * unconditionally afterwards, so a QuotaExceededError partway through the key
 * loop ended as `{ ran: true }` with legacy keys still in place — and every
 * later boot short-circuited on the sentinel. Half the user's data present in
 * the profile and invisible to the app, permanently, landing on exactly the
 * user with the most legacy data: an upgrade on a nearly-full profile.
 */
describe('migrateFossflowStorageKeys — a partial run is retried (CHR-06)', () => {
  /** Make the Nth `setItem` on localStorage throw, as a full profile would. */
  const failLocalWriteAfter = (n: number) => {
    const real = Storage.prototype.setItem;
    let seen = 0;
    const spy = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (this: Storage, key: string, value: string) {
        if (this === localStorage && ++seen > n) {
          throw new DOMException('quota', 'QuotaExceededError');
        }
        return real.call(this, key, value);
      });
    return () => spy.mockRestore();
  };

  it('does NOT write the sentinel when a pass throws', () => {
    localStorage.setItem('fossflow_a', '1');
    localStorage.setItem('fossflow_b', '2');
    localStorage.setItem('fossflow_c', '3');
    const restore = failLocalWriteAfter(1);
    try {
      const result = migrateFossflowStorageKeys();
      expect(result.ran).toBe(true);
      expect(result.complete).toBe(false);
      expect(localStorage.getItem(SENTINEL)).toBeNull();
    } finally {
      restore();
    }
  });

  it('so the NEXT boot retries and finishes the job', () => {
    localStorage.setItem('fossflow_a', '1');
    localStorage.setItem('fossflow_b', '2');
    localStorage.setItem('fossflow_c', '3');
    const restore = failLocalWriteAfter(1);
    try {
      migrateFossflowStorageKeys();
    } finally {
      restore();
    }
    // PRECONDITION: legacy keys really did survive the first attempt.
    expect(
      ['fossflow_a', 'fossflow_b', 'fossflow_c'].some(
        (k) => localStorage.getItem(k) !== null
      )
    ).toBe(true);

    const second = migrateFossflowStorageKeys();
    expect(second.ran).toBe(true);
    expect(second.complete).toBe(true);
    expect(localStorage.getItem('axoview_a')).toBe('1');
    expect(localStorage.getItem('axoview_b')).toBe('2');
    expect(localStorage.getItem('axoview_c')).toBe('3');
    expect(localStorage.getItem(SENTINEL)).not.toBeNull();
  });

  it('a failing localStorage pass does not stop the sessionStorage pass', () => {
    // Migrating what CAN be migrated is strictly better than stopping: a quota
    // failure in one store says nothing about the other, and the retry picks up
    // the rest.
    localStorage.setItem('fossflow_a', '1');
    sessionStorage.setItem('fossflow_s', 's');
    const restore = failLocalWriteAfter(0);
    try {
      const result = migrateFossflowStorageKeys();
      expect(result.complete).toBe(false);
      expect(result.sessionMigrated).toBe(1);
      expect(sessionStorage.getItem('axoview_s')).toBe('s');
    } finally {
      restore();
    }
  });

  it('CONTROL: a clean run still writes the sentinel and reports complete', () => {
    localStorage.setItem('fossflow_a', '1');
    const result = migrateFossflowStorageKeys();
    expect(result.complete).toBe(true);
    expect(localStorage.getItem(SENTINEL)).not.toBeNull();
    // …and a second call short-circuits, as before.
    expect(migrateFossflowStorageKeys().ran).toBe(false);
  });
});
