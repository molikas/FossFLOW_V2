import { loadGapiModule } from './gapiLoader';
import { authStore } from '../../stores/authStore';

// ADR 0042 §2 rung 3 — the Google Picker is the sanctioned per-file grant
// mechanism under drive.file: DocsView.setFileIds pre-navigates the Picker to
// the shared file so the recipient lands directly on the consent step. The
// grant is durable (recorded on the file's ACL); after a pick the caller
// retries the token read.
//
// TRAP (tactical note): setAppId takes the Cloud project NUMBER, not the
// OAuth client id — a wrong value fails SILENTLY (the pick "succeeds" but the
// grant never registers and files.get keeps 404ing).

/**
 * S3/DRV-03: `'wrong-file'` used to be folded into `'cancelled'`, so picking the
 * wrong file in the Picker returned the recipient to exactly the same wall with
 * no message — indistinguishable from closing the dialog deliberately, which
 * made "click the button and pick the same wrong file again" the natural next
 * action. The distinction was already computed here; it just had nowhere to go.
 */
export type DrivePickerOutcome = 'picked' | 'cancelled' | 'wrong-file';

export type DrivePickerErrorReason =
  /** googleApiKey / googleProjectNumber not configured (ADR 0042 §5) — the gate hides the button. */
  | 'unavailable'
  /** No valid drive.file token — the caller must route through sign-in first. */
  | 'no-token'
  /** The gapi picker module loaded but exposed no google.picker namespace. */
  | 'load-failed';

export class DrivePickerError extends Error {
  constructor(
    readonly reason: DrivePickerErrorReason,
    message: string
  ) {
    super(message);
    this.name = 'DrivePickerError';
    // ES5-downlevel Error subclassing loses the prototype chain (ts-jest);
    // restore it so `instanceof DrivePickerError` works everywhere.
    Object.setPrototypeOf(this, DrivePickerError.prototype);
  }
}

// Minimal local declarations of the google.picker surface we touch — the
// official types ship with the Marketplace SDK we deliberately don't depend on.
interface PickerDocsView {
  // Google's reference documents a comma-separated STRING of ids, not an
  // array (developers.google.com/workspace/drive/picker/reference — DocsView).
  setFileIds(fileIds: string): PickerDocsView;
}

interface PickerInstance {
  setVisible(visible: boolean): void;
}

interface PickerPickedDoc {
  id?: string;
}
interface PickerCallbackData {
  action?: string;
  /** Present on the PICKED action — the documents the user selected. */
  docs?: PickerPickedDoc[];
}
type PickerCallback = (data: PickerCallbackData) => void;

interface PickerBuilder {
  setAppId(projectNumber: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  addView(view: PickerDocsView): PickerBuilder;
  setCallback(cb: PickerCallback): PickerBuilder;
  build(): PickerInstance;
}

interface PickerNamespace {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new () => PickerDocsView;
  Action: { PICKED: string; CANCEL: string };
}

function getPickerNamespace(): PickerNamespace | null {
  const g = (window as unknown as { google?: { picker?: PickerNamespace } })
    .google;
  return g?.picker ?? null;
}

export interface LaunchDrivePickerOptions {
  fileId: string;
  googleApiKey: string | null;
  googleProjectNumber: string | null;
}

/**
 * Launch the Picker deep-targeted at one file. Resolves 'picked' once the
 * grant registered (caller retries the token read) or 'cancelled' when the
 * user dismissed the dialog without picking.
 */
export async function launchDrivePicker(
  opts: LaunchDrivePickerOptions
): Promise<DrivePickerOutcome> {
  if (!opts.googleApiKey || !opts.googleProjectNumber) {
    throw new DrivePickerError(
      'unavailable',
      'Google Picker needs both googleApiKey and googleProjectNumber configured'
    );
  }
  const token = await authStore.getValidToken();
  if (!token) {
    throw new DrivePickerError('no-token', 'Google Picker needs a signed-in session');
  }
  await loadGapiModule('picker');
  const picker = getPickerNamespace();
  if (!picker) {
    throw new DrivePickerError(
      'load-failed',
      'gapi picker module loaded without window.google.picker'
    );
  }
  return new Promise<DrivePickerOutcome>((resolve) => {
    const instance = new picker.PickerBuilder()
      .setAppId(opts.googleProjectNumber!)
      .setOAuthToken(token)
      .setDeveloperKey(opts.googleApiKey!)
      .addView(new picker.DocsView().setFileIds(opts.fileId))
      .setCallback((data) => {
        // The Picker also emits 'loaded' — only PICKED/CANCEL settle us.
        if (data.action === picker.Action.PICKED) {
          // setFileIds pre-navigates to the single target, but a user can still
          // browse and pick a DIFFERENT file; granting on the wrong file leaves
          // the read 404ing forever. Only a pick that includes the target file
          // counts as a real grant — anything else keeps the gate up so the
          // recipient can pick the right one, and says so (DRV-03). A PICKED
          // with no docs array (shape drift) is treated leniently as the target.
          const docs = data.docs;
          const grantedTarget = !docs || docs.some((d) => d?.id === opts.fileId);
          resolve(grantedTarget ? 'picked' : 'wrong-file');
        } else if (data.action === picker.Action.CANCEL) {
          resolve('cancelled');
        }
      })
      .build();
    instance.setVisible(true);
  });
}
