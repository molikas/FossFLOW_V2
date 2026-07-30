import { Page, expect } from '@playwright/test';

/**
 * Drive the one import flow (A3/ZIP-09, owner ruling 2026-07-30).
 *
 * The empty tree used to skip the dialog and import straight to root, so these
 * journeys clicked Import and caught a native file chooser. Every entry point
 * now opens `ImportDialog`; an empty tree just means root is preselected. The
 * chooser is one click further in, behind "Choose file…", and the import is
 * explicitly confirmed — which is the point of the ruling: the destination is
 * named on screen before anything is written.
 */
export async function importFileViaDialog(
  page: Page,
  filePath: string
): Promise<void> {
  const dialog = page.getByRole('dialog').filter({ hasText: 'Import' });
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5_000 }),
    dialog.getByRole('button', { name: 'Choose file…' }).click()
  ]);
  await fileChooser.setFiles(filePath);

  // The dialog moves to its configure step (zip or json) and shows the
  // destination. Confirm it.
  const confirm = dialog.getByRole('button', { name: 'Import', exact: true });
  await expect(confirm).toBeEnabled({ timeout: 10_000 });
  await confirm.click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

/** The dialog's file chooser, without confirming — for failure-path tests. */
export async function chooseImportFile(
  page: Page,
  filePath: string
): Promise<void> {
  const dialog = page.getByRole('dialog').filter({ hasText: 'Import' });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5_000 }),
    dialog.getByRole('button', { name: 'Choose file…' }).click()
  ]);
  await fileChooser.setFiles(filePath);
}
