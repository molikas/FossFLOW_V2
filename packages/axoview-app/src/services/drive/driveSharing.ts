import { appDisplayBase } from '../../appBase';
import { authStore } from '../../stores/authStore';

// ADR 0042 §1/§4 (rev. 2026-07-14) — Drive-place sharing surface. Deliberately
// OUTSIDE the StorageProvider interface: "sharing" a Drive diagram is a Drive
// ACL concern plus a deterministic preview URL, not a publish-a-snapshot
// contract. v1 manages access with a CUSTOM in-app UI over the Drive REST v3
// `permissions` collection (list / create / delete), authorized under
// `drive.file` for app-created files. The legacy client-side `ShareClient`
// widget was dropped: Google is deprecating it (observed live 2026-07-14 as a
// fedcm-migration timeout + `contentDocument` crash), it demanded a broad CSP
// surface, and it broke whenever third-party cookies were blocked. The REST
// calls all hit www.googleapis.com, already allowed by connect-src.

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export interface FileShareMeta {
  /** Drive's own viewer URL — used to open the file directly in Drive if needed. */
  webViewLink: string | null;
  /** Non-null only on link-shared legacy files; app-created files omit it. */
  resourceKey: string | null;
}

/**
 * S3/DRV-04: `'domain'` is one of the four values `DrivePermission` declares,
 * and it matched NEITHER the summary predicate (`type === 'anyone'`) nor the
 * people count (`user` / `group`) — so a diagram shared with an entire Google
 * Workspace domain showed as **Restricted with nobody listed**, and copying its
 * link warned that "only people with access can open it". The owner was told
 * the opposite of the truth about who can read their diagram.
 *
 * It gets its own summary rather than being folded into `anyone-with-link`,
 * because the two are not the same promise: a domain grant is link-readable for
 * everyone at the company, not for everyone with the link.
 */
export type AccessSummary = 'anyone-with-link' | 'domain' | 'restricted';

export interface AccessOverview {
  summary: AccessSummary;
  /** Named people with access — excludes the owner ("you"), the anyone-link
   *  entry and any domain grant, so it matches the count a user reads as
   *  "shared with N people". */
  peopleCount: number;
  /** The domains the file is shared with, if any (DRV-04). Surfaced as its own
   *  row rather than counted as people. */
  domains: string[];
}

/** Does this overview mean "someone other than the owner can open the link"? */
export const isShared = (overview: AccessOverview): boolean =>
  overview.summary !== 'restricted' || overview.peopleCount > 0;

/** The roles the custom share UI can grant. Drive supports more; a read-only
 *  preview product only meaningfully offers viewer / editor. */
export type ShareRole = 'reader' | 'writer';

export interface DrivePermission {
  id: string;
  type: 'user' | 'group' | 'domain' | 'anyone';
  role: 'owner' | 'organizer' | 'fileOrganizer' | 'writer' | 'commenter' | 'reader';
  emailAddress?: string;
  displayName?: string;
  /** Set on `type: 'domain'` grants — the Workspace domain (DRV-04). */
  domain?: string;
}

/**
 * Drive's structured error body. `error.message` is usually surfaceable, but
 * POLICY rejections arrive with an EMPTY user message —
 * `Bad Request. User message: ""` — so the only actionable signal is
 * `errors[0].reason` (owner repro 2026-07-28: a Workspace account hitting
 * `publishOutNotPermitted` saw the raw empty-message string in the dialog).
 * Carry the reason so the UI can map it to copy a human can act on.
 */
export class DriveShareError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Google's machine-readable cause, e.g. `publishOutNotPermitted`. */
    readonly reason?: string
  ) {
    super(message);
    this.name = 'DriveShareError';
    Object.setPrototypeOf(this, DriveShareError.prototype);
  }
}

async function requireToken(): Promise<string> {
  const token = await authStore.getValidToken();
  if (!token) throw new DriveShareError(401, 'Not signed in to Google');
  return token;
}

/**
 * Google wraps its user-facing text as `... User message: "<text>"`, and on
 * policy rejections that text is EMPTY. Surfacing it verbatim shows the user
 * a message that literally says nothing, so treat an empty user message as
 * absent and keep our own fallback (the `reason` carries the real cause).
 */
const EMPTY_USER_MESSAGE = /User message:\s*""/;

/** Surface Google's own error message (e.g. "The user ... could not be found")
 *  instead of a bare status — the custom dialog shows it inline. */
async function toError(res: Response, fallback: string): Promise<DriveShareError> {
  let message = fallback;
  let reason: string | undefined;
  try {
    const body = (await res.json()) as {
      error?: { message?: string; errors?: { reason?: string }[] };
    };
    reason = body?.error?.errors?.[0]?.reason;
    const apiMessage = body?.error?.message;
    if (apiMessage && !EMPTY_USER_MESSAGE.test(apiMessage)) message = apiMessage;
  } catch {
    /* non-JSON body — keep the fallback */
  }
  return new DriveShareError(res.status, message, reason);
}

/**
 * Preview URL for a Drive-place diagram — `/display/drive/<fileId>` under the
 * page origin + APP_BASENAME (same anchoring rationale as shareUrl.ts). The
 * link is LIVE (render-at-open, ADR 0042 §3), unlike `/display/p/<uuid>`
 * snapshots. `resourceKey` propagates as a query param iff present.
 */
export function drivePreviewUrl(fileId: string, resourceKey?: string | null): string {
  const base = `${appDisplayBase()}/drive/${encodeURIComponent(fileId)}`;
  return resourceKey
    ? `${base}?resourceKey=${encodeURIComponent(resourceKey)}`
    : base;
}

/** Token-authorized (ADR 0035 rule 2) fetch of the fields sharing needs. */
export async function getFileShareMeta(fileId: string): Promise<FileShareMeta> {
  const token = await requireToken();
  const res = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=webViewLink,resourceKey`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw await toError(res, `Drive files.get failed (${res.status})`);
  const data = (await res.json()) as { webViewLink?: string; resourceKey?: string };
  return {
    webViewLink: data.webViewLink ?? null,
    resourceKey: data.resourceKey ?? null
  };
}

/**
 * All permissions on the file, pages drained. `permissions.list` is authorized
 * under `drive.file` on app-created files. Drive PAGES permissions — a grant
 * (incl. `type:'anyone'`) can sit past page 1, so the token is drained
 * unconditionally or the ACL view silently truncates.
 */
export async function listPermissions(fileId: string): Promise<DrivePermission[]> {
  const token = await requireToken();
  const out: DrivePermission[] = [];
  let pageToken: string | undefined;
  do {
    const url =
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions` +
      `?fields=${encodeURIComponent(
        // `domain` so a Workspace-wide grant can be named, not just detected
        // (DRV-04).
        'nextPageToken,permissions(id,type,role,emailAddress,displayName,domain)'
      )}&pageSize=100` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw await toError(res, `Drive permissions.list failed (${res.status})`);
    const data = (await res.json()) as {
      permissions?: DrivePermission[];
      nextPageToken?: string;
    };
    out.push(...(data.permissions ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

/**
 * One-line ACL state for the popover (ADR 0042 §1): does the copied preview
 * link work anonymously? A `type:'anyone'` entry ⇒ link-readable.
 */
export async function getAccessSummary(fileId: string): Promise<AccessSummary> {
  return (await getAccessOverview(fileId)).summary;
}

/**
 * Access summary + the count of named people with access — one `permissions.list`
 * drain drives both the anonymous-link indicator and the "shared with N people"
 * status. The owner and the `type:'anyone'` entry are excluded from the count.
 */
export async function getAccessOverview(fileId: string): Promise<AccessOverview> {
  const perms = await listPermissions(fileId);
  const domains = perms
    .filter((p) => p.type === 'domain')
    .map((p) => p.domain || p.displayName || 'your organisation');
  return {
    summary: perms.some((p) => p.type === 'anyone')
      ? 'anyone-with-link'
      : domains.length > 0
        ? 'domain'
        : 'restricted',
    peopleCount: perms.filter(
      (p) => (p.type === 'user' || p.type === 'group') && p.role !== 'owner'
    ).length,
    domains
  };
}

/**
 * Toggle "anyone with the link can view". Enabling creates a
 * `{type:'anyone', role:'reader'}` permission (so the copied `/display/drive`
 * link resolves via the anonymous key-read rung); disabling deletes every
 * anyone-permission the file carries.
 */
export async function setAnyoneWithLink(fileId: string, enabled: boolean): Promise<void> {
  if (enabled) {
    const token = await requireToken();
    const res = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
      }
    );
    if (!res.ok) throw await toError(res, `Drive permissions.create(anyone) failed (${res.status})`);
    return;
  }
  // DRV-05 (owner ruling 2026-07-30): collect PER-PERMISSION outcomes. The loop
  // used to stop at the first rejection, so with several anyone-permissions on
  // one file a partial revoke threw — and the caller could not tell "nothing was
  // revoked" from "some were, and the link may still be live". Delete them all,
  // then report honestly.
  const anyone = (await listPermissions(fileId)).filter((p) => p.type === 'anyone');
  const failures: unknown[] = [];
  for (const p of anyone) {
    try {
      await removePermission(fileId, p.id);
    } catch (err) {
      failures.push(err);
    }
  }
  if (failures.length > 0) {
    const first = failures[0];
    throw new DriveShareError(
      first instanceof DriveShareError ? first.status : 0,
      failures.length === anyone.length
        ? 'Could not turn off link sharing.'
        : 'Link sharing may still be active — one of the sharing permissions could not be removed.',
      first instanceof DriveShareError ? first.reason : undefined
    );
  }
}

/**
 * Grant a specific person access by email. `sendNotificationEmail` defaults ON
 * (Google emails them the file). Google's notification links at the RAW Drive
 * file, so when notifying we pass an `emailMessage` pointing the recipient at
 * OUR `/display/drive` viewer — a partial mitigation for the raw-JSON-email UX
 * (§7.4 of the Google-API review; the full fix is a first-party snapshot store).
 * `emailMessage` is ignored by Drive unless `sendNotificationEmail` is true.
 */
export async function addPersonPermission(
  fileId: string,
  emailAddress: string,
  role: ShareRole,
  sendNotificationEmail = true,
  emailMessage?: string
): Promise<void> {
  const token = await requireToken();
  const res = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions` +
      `?sendNotificationEmail=${sendNotificationEmail ? 'true' : 'false'}` +
      (sendNotificationEmail && emailMessage
        ? `&emailMessage=${encodeURIComponent(emailMessage)}`
        : ''),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role, type: 'user', emailAddress })
    }
  );
  if (!res.ok) throw await toError(res, `Drive permissions.create(user) failed (${res.status})`);
}

/** Revoke one permission. A 404 (already gone) is treated as success. */
export async function removePermission(fileId: string, permissionId: string): Promise<void> {
  const token = await requireToken();
  const res = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok && res.status !== 404) {
    throw await toError(res, `Drive permissions.delete failed (${res.status})`);
  }
}
