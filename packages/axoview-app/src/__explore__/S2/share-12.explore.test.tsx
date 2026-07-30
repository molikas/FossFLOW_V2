/**
 * S2 / SHARE-12 — the recipient-facing dead-end for a `/display/p/<uuid>` link.
 *
 * `App.tsx` renders `LocalModeShareErrorDialog` whenever
 * `isPublicShareUrl && !serverStorageAvailable`. Both halves of that condition
 * hold for a snapshot link opened against the **Cloudflare** deployment — the
 * worker hardcodes `serverStorage: false` — and against any local `npm run dev`
 * without the Express backend. The person who hits it is normally a RECIPIENT,
 * not the operator, and the dialog's copy addresses the operator.
 *
 * Probed at the component tier: the copy and the audience are the finding, so
 * rendering the real dialog is the cheapest thing that can falsify it.
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === 'string' ? fallback : key
  })
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { LocalModeShareErrorDialog } =
  require('../../components/LocalModeShareErrorDialog') as typeof import('../../components/LocalModeShareErrorDialog');
/* eslint-enable @typescript-eslint/no-var-requires */

const APP_SRC = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(APP_SRC, rel), 'utf-8');

describe('SHARE-12 — the share-link dead-end tells a recipient to deploy a server', () => {
  test('CHARACTERIZATION: the copy names Cloudflare as the fix, and the Cloudflare worker can never serve a snapshot', () => {
    render(<LocalModeShareErrorDialog open onDismiss={() => {}} />);

    // --- precondition: the dialog really is up and this is its only copy ---
    expect(
      screen.getByText('This share link needs a session backend.')
    ).toBeInTheDocument();
    const body = screen.getByText(/Share links can only be opened/);
    expect(body).toBeInTheDocument();

    // The advice: deploy. Addressed to whoever is reading — normally the
    // recipient of someone else's link, who owns no deployment at all.
    expect(body.textContent).toContain('Deploy via Docker or Cloudflare');
    // ...and there is no action but OK — no "ask the sender", no explanation
    // that the link belongs to a different deployment.
    const buttons = document.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe('OK');

    // The Cloudflare half of that advice is factually wrong: the worker
    // hardcodes serverStorage:false, which is the exact condition that raised
    // this dialog, and has no /api/public/diagrams handler at all.
    const worker = fs.readFileSync(
      path.resolve(APP_SRC, '../../axoview-worker/src/app.ts'),
      'utf-8'
    );
    expect(worker).toContain('serverStorage: false');
    expect(worker).not.toContain('/api/public/diagrams');
    // Its catch-all is what a snapshot fetch would actually hit.
    expect(worker).toContain("'Server storage is disabled'");
  });

  test('CHARACTERIZATION: the gate fires on the URL shape alone — no attempt to distinguish recipient from operator', () => {
    // `showLocalModeShareError = isPublicShareUrl && !serverStorageAvailable`,
    // where `isPublicShareUrl = !!shareUuid` (the route param). Nothing about
    // ownership, provenance, or which deployment minted the link enters the
    // condition — so a recipient and a mis-deployed operator get identical copy.
    const app = read('App.tsx');
    expect(app).toContain(
      'const showLocalModeShareError = isPublicShareUrl && !serverStorageAvailable;'
    );
    const lifecycle = read('providers/DiagramLifecycleProvider.tsx');
    expect(lifecycle).toContain('const isPublicShareUrl = !!shareUuid;');
  });

  test('CONTROL: the sibling Drive dead-end DOES address its reader correctly', () => {
    // Proof that recipient-aware copy is the house standard and this dialog is
    // the outlier: DriveDisplayGate's unreachable-file branch tells the viewer to
    // switch accounts or ask the OWNER to share it — no deployment advice.
    const gate = read('components/DriveDisplayGate.tsx');
    expect(gate).toContain('ask the owner to share the file with you');
    expect(gate).not.toMatch(/Deploy via/i);
  });
});
