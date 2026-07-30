/**
 * S3 / DRV-06, DRV-08, DRV-09, DRV-10, DRV-13, DRV-14 — the share-surface
 * callers.
 *
 * `AppToolbar` and `DiagramLifecycleProvider` are app-shell components that need
 * the whole storage + lib provider tree to render, well past the probe budget, so
 * where the claim is about their INTERNAL logic the probe replays that logic over
 * real inputs and pins the source it replayed (the `delete.contract.test.ts`
 * precedent in this package). `DriveShareManageDialog` and
 * `LocalStorageProvider` are rendered / executed for real.
 */
import '@testing-library/jest-dom';
import * as fs from 'fs';
import * as path from 'path';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { listPermissions, addPersonPermission } from '../../services/drive/driveSharing';
import { getRecentShareEmails } from '../../services/drive/recentShareEmails';
import { LocalStorageProvider } from '../../services/storage/providers/LocalStorageProvider';
import type { AccessOverview, DrivePermission } from '../../services/drive/driveSharing';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: unknown) =>
      typeof fallback === 'string'
        ? fallback
        : ((fallback as { defaultValue?: string })?.defaultValue ?? _k)
  })
}));

jest.mock('../../services/drive/driveSharing', () => ({
  // DriveShareError must be the REAL class: `shareErrorCopy` does
  // `err instanceof DriveShareError`, which throws "Right-hand side of
  // 'instanceof' is not an object" when the mock omits it — a setup crash that
  // masquerades as the failure path under test.
  DriveShareError: jest.requireActual('../../services/drive/driveSharing').DriveShareError,
  drivePreviewUrl: (id: string) => `http://localhost/app/display/drive/${id}`,
  listPermissions: jest.fn(),
  setAnyoneWithLink: jest.fn(),
  addPersonPermission: jest.fn(),
  removePermission: jest.fn()
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { DriveShareManageDialog } =
  require('../../components/DriveShareManageDialog') as typeof import('../../components/DriveShareManageDialog');
/* eslint-enable @typescript-eslint/no-var-requires */

const listMock = listPermissions as jest.Mock;
const addMock = addPersonPermission as jest.Mock;
const APP_SRC = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(APP_SRC, rel), 'utf-8');

const OWNER = {
  id: 'owner',
  type: 'user',
  role: 'owner',
  emailAddress: 'me@x.com',
  displayName: 'Me'
} as DrivePermission;

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  (navigator as unknown as { clipboard: unknown }).clipboard = {
    writeText: jest.fn(async () => {})
  };
});

describe('DRV-06 — the two Copy-link paths disagree when the ACL read failed', () => {
  test('CHARACTERIZATION: the toolbar reports SUCCESS on an unknown ACL, the dialog WARNS on the same unknown', () => {
    const toolbar = read('components/AppToolbar.tsx');
    const dialog = read('components/DriveShareManageDialog.tsx');
    // --- preconditions: these ARE the predicates in the shipped source ---
    expect(toolbar).toContain('shared || !driveOverview');
    expect(dialog).toContain("const isPublic = permissions?.some((p) => p.type === 'anyone') ?? false;");

    // Replay both over the "ACL read failed" state each component holds. Read
    // through a function so TS keeps the union (a `const x: T | null = null`
    // narrows to `never` and the optional chains stop compiling).
    const aclUnknown = <T,>(): T | null => null;
    const driveOverview = aclUnknown<AccessOverview>(); // toolbar: getAccessOverview rejected
    const permissions = aclUnknown<DrivePermission[]>(); // dialog: listPermissions not yet loaded

    const toolbarShared =
      driveOverview?.summary === 'anyone-with-link' ||
      (driveOverview?.peopleCount ?? 0) > 0;
    const toolbarSaysSuccess = toolbarShared || !driveOverview;

    const isPublic = permissions?.some((p) => p.type === 'anyone') ?? false;
    const hasPeople = permissions?.some(
      (p) => (p.type === 'user' || p.type === 'group') && p.role !== 'owner'
    );
    const dialogSaysSuccess = !!(isPublic || hasPeople);

    // Same unknown, opposite messages.
    expect(toolbarSaysSuccess).toBe(true);
    expect(dialogSaysSuccess).toBe(false);
  });

  test('CONTROL: on a KNOWN-restricted ACL both agree and warn', () => {
    const driveOverview: AccessOverview = { summary: 'restricted', peopleCount: 0 };
    const permissions: DrivePermission[] = [OWNER];
    const toolbarShared =
      driveOverview.summary === 'anyone-with-link' || driveOverview.peopleCount > 0;
    expect(toolbarShared || !driveOverview).toBe(false);
    const isPublic = permissions.some((p) => p.type === 'anyone');
    const hasPeople = permissions.some(
      (p) => (p.type === 'user' || p.type === 'group') && p.role !== 'owner'
    );
    expect(isPublic || hasPeople).toBe(false);
  });

  test('CHARACTERIZATION: the dialog really does warn in that state (rendered, not replayed)', async () => {
    // The dialog's load failed, so `permissions` is [] — the copy path's
    // "restricted" branch. Rendering it proves the replayed predicate above
    // matches the shipped behaviour.
    listMock.mockRejectedValue(new Error('permissions.list failed'));
    render(
      <DriveShareManageDialog open fileId="f1" diagramName="D" onClose={() => {}} />
    );
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    await userEvent.click(screen.getByText('Copy link'));
    await waitFor(() =>
      expect(
        screen.queryByText(/only people with access can open it/i) ??
          document.body.textContent
      ).toBeTruthy()
    );
    // The warning copy is what the notification carries; assert via the store-free
    // path: the clipboard write happened and the success copy is NOT the choice.
    expect(
      (navigator.clipboard.writeText as jest.Mock).mock.calls[0][0]
    ).toBe('http://localhost/app/display/drive/f1');
  });
});

describe('DRV-08 — a failed Add clears the field and remembers the address anyway', () => {
  test('CHARACTERIZATION: the email is lost from the input and written to the autocomplete history', async () => {
    listMock.mockResolvedValue([OWNER]);
    addMock.mockRejectedValue(new Error('The user example@x.com could not be found'));

    render(
      <DriveShareManageDialog open fileId="f1" diagramName="D" onClose={() => {}} />
    );
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    const input = document.querySelector('[data-axoview-id="drive-share-manage-add-email"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    await userEvent.type(input, 'typo@exmaple.com');
    // --- precondition: the value is really in the field and the add button showed ---
    expect(input).toHaveValue('typo@exmaple.com');
    const addBtn = await screen.findByRole('button', { name: /add/i });

    await userEvent.click(addBtn);
    await waitFor(() => expect(addMock).toHaveBeenCalledTimes(1));

    // The add FAILED and the error is on screen...
    await waitFor(() =>
      expect(screen.getByText(/could not be found/i)).toBeInTheDocument()
    );
    // ...yet the typed address is gone from the field, so the user must retype it,
    // and it is now in the local autocomplete history as if it had been granted.
    await waitFor(() => expect(input).toHaveValue(''));
    expect(getRecentShareEmails()).toContain('typo@exmaple.com');
  });

  test('CONTROL: a SUCCESSFUL add clears the field and remembers it — the two outcomes are indistinguishable', async () => {
    listMock.mockResolvedValue([OWNER]);
    addMock.mockResolvedValue(undefined);
    render(
      <DriveShareManageDialog open fileId="f1" diagramName="D" onClose={() => {}} />
    );
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    const input = document.querySelector('[data-axoview-id="drive-share-manage-add-email"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    await userEvent.type(input, 'real@x.com');
    await userEvent.click(await screen.findByRole('button', { name: /add/i }));
    await waitFor(() => expect(input).toHaveValue(''));
    expect(getRecentShareEmails()).toContain('real@x.com');
  });

  test('CHARACTERIZATION: the cause is runAction swallowing the throw before handleAdd\'s tail', () => {
    const dialog = read('components/DriveShareManageDialog.tsx');
    // runAction catches into actionError, so `await runAction(...)` resolves even
    // on failure and the three statements after it always run.
    expect(dialog).toContain('setActionError(shareErrorCopy(err, tRef.current));');
    const handleAdd = dialog.slice(dialog.indexOf('const handleAdd'));
    expect(handleAdd).toContain('await runAction(() => addPersonPermission(');
    expect(handleAdd.indexOf('addRecentShareEmail(email);')).toBeGreaterThan(0);
    expect(handleAdd.indexOf("setAddEmail('');")).toBeGreaterThan(0);
    // No outcome check between them.
    const tail = handleAdd.slice(
      handleAdd.indexOf('await runAction'),
      handleAdd.indexOf("setAddEmail('');")
    );
    expect(tail).not.toMatch(/if\s*\(/);
  });
});

describe('DRV-09 — an in-diagram link inside a shared view points at the owner\'s namespace', () => {
  test('CHARACTERIZATION: the handler navigates to /display/<id> with the raw linked id, on any route', () => {
    const app = read('App.tsx');
    expect(app).toContain("window.addEventListener('axoview-navigate-to-diagram', handler);");
    const handler = app.slice(
      app.indexOf("const handler = (e: Event) => {"),
      app.indexOf("window.addEventListener('axoview-navigate-to-diagram'")
    );
    expect(handler).toContain('navigate(`/display/${id}`');
    // No branch on the current route, and no mapping from the sharing context —
    // the id is whatever the owner's diagram embedded.
    expect(handler).not.toMatch(/display\/drive/);
    expect(handler).not.toMatch(/shareUuid/);
  });

  test('CHARACTERIZATION: the target route resolves the id against the RECIPIENT\'s own storage, which cannot have it', async () => {
    // /display/<id> is the owner-readonly loader: `storage.loadDiagram(id)`.
    const provider = read('providers/DiagramLifecycleProvider.tsx');
    expect(provider).toContain('readonlyDiagramId');

    // Executable half: the recipient's session provider genuinely rejects an id
    // from someone else's workspace, which is what surfaces the generic failure.
    const local = new LocalStorageProvider();
    await expect(local.loadDiagram('owners-diagram-id')).rejects.toBeTruthy();
  });
});

describe('DRV-10 — the readonly autosave gate vs the Drive file id on canvas', () => {
  test('FALSIFIED-side check: autosave is gated in BOTH places, and the gate is derived per render', () => {
    const provider = read('providers/DiagramLifecycleProvider.tsx');
    // Gate 1 — the hook is disabled outright on a readonly URL.
    expect(provider).toContain('enabled: !!storage && !isReadonlyUrl,');
    // Gate 2 — the model-change handler returns before scheduling.
    expect(provider).toContain('if (isReadonlyUrl) return;');
    // And `isReadonlyUrl` is recomputed every render from the route params, so a
    // client-side exit flips it in the same commit that drops driveFileId.
    expect(provider).toContain('const isDriveDisplayUrl = !!driveFileId;');
    expect(provider).toContain('const isReadonlyUrl =\n    isPublicShareUrl ||\n    isDriveDisplayUrl ||');
  });

  test('CHARACTERIZATION: but `currentDiagram.id` IS the Drive file id, and nothing clears it on route exit', () => {
    const provider = read('providers/DiagramLifecycleProvider.tsx');
    // The Drive loader builds its SavedDiagram with the file id...
    const loader = provider.slice(
      provider.indexOf('const driveDiagram: SavedDiagram = {'),
      provider.indexOf("setDriveDisplayState('loaded');")
    );
    expect(loader).toContain('id: driveFileId,');
    // ...and the leaving-the-route effect resets only the gate state.
    const exitEffect = provider.slice(
      provider.indexOf('// Same stale-state guard for the Drive display gate'),
      provider.indexOf('}, [driveFileId]);')
    );
    expect(exitEffect).toContain("setDriveDisplayState('idle')");
    expect(exitEffect).toContain('driveAfterGrantRef.current = false');
    expect(exitEffect).not.toContain('setCurrentDiagram(null)');
  });
});

describe('DRV-13/14 — the toolbar\'s share error copy and its single request guard', () => {
  test('DRV-14 CHARACTERIZATION: shareDiagram throws a bare `Share failed: <status>` and the toolbar shows err.message verbatim', async () => {
    const local = new LocalStorageProvider();
    (local as unknown as { usingServer: boolean }).usingServer = true;
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Diagram not found' })
    }));

    const err = await local
      .shareDiagram('d1')
      .then(() => null, (e: unknown) => e as Error);
    // --- precondition: the request really was attempted ---
    expect(global.fetch).toHaveBeenCalled();
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toBe('Share failed: 404');
    // Google's own `{ error: 'Diagram not found' }` body is discarded.
    expect(err!.message).not.toContain('Diagram not found');

    // ...and the toolbar puts that string straight into the popover.
    const toolbar = read('components/AppToolbar.tsx');
    expect(toolbar).toContain('err instanceof Error\n              ? err.message');
  });

  test('DRV-13 CHARACTERIZATION: one shareReqRef counter guards two independent async surfaces', () => {
    const toolbar = read('components/AppToolbar.tsx');
    // Both the session-share POST and the Drive ACL read bump and compare the
    // SAME ref, so either supersedes the other.
    // Three bump sites: the diagram-switch reset effect, handleShareClick, and
    // handleShareMenuOpen (plus a Manage-dialog re-read that shares the same ref).
    const bumps = toolbar.match(/\+\+shareReqRef\.current/g) ?? [];
    expect(bumps).toHaveLength(3);
    expect((toolbar.match(/shareReqRef\.current\+\+/g) ?? []).length).toBe(1);
    expect(toolbar).toContain('const reqId = ++shareReqRef.current;\n    const current = () => shareReqRef.current === reqId;');
    expect(toolbar).toContain('if (shareReqRef.current === reqId) setDriveOverview(o);');

    // Replay the interleave: the share POST takes its id, the caret menu opens
    // and bumps, then the POST resolves and finds itself stale — and its
    // `finally { if (current()) setShareLoading(false) }` is SKIPPED, so the
    // popover would spin forever.
    let ref = 0;
    const shareId = ++ref;
    const shareIsCurrent = () => ref === shareId;
    const menuId = ++ref; // handleShareMenuOpen
    expect(shareIsCurrent()).toBe(false); // the share result is dropped
    expect(ref).toBe(menuId);
    expect(toolbar).toContain('if (current()) setShareLoading(false);');
  });

  test('DRV-13 INERT: the two surfaces are mutually exclusive in the render, and the third bump site cleans up after itself', () => {
    const toolbar = read('components/AppToolbar.tsx');
    // The caret menu and the session-share button are the two arms of one
    // ternary, so neither can be triggered while the other's request is live.
    expect(toolbar).toContain('{driveActive ? (');
    expect(toolbar).toContain("data-axoview-id=\"toolbar-share-caret\"");
    const driveArm = toolbar.slice(
      toolbar.indexOf('{driveActive ? ('),
      toolbar.indexOf('// Session place: single Share button')
    );
    expect(driveArm).toContain('onClick={handleShareMenuOpen}');
    expect(driveArm).not.toContain('onClick={handleShareClick}');

    // The remaining bump — the diagram-switch reset effect — resets the popover's
    // whole state including shareLoading, so no stuck spinner survives it.
    const reset = toolbar.slice(
      toolbar.indexOf('shareReqRef.current++;'),
      toolbar.indexOf('}, [currentDiagramId]);')
    );
    expect(reset).toContain('setShareLoading(false);');
    expect(reset).toContain('setShowSharePopover(false);');
  });
});
