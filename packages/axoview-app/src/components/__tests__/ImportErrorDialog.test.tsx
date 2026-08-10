import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportErrorDialog } from '../ImportErrorDialog';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key
  })
}));

describe('ImportErrorDialog', () => {
  test('renders nothing when closed', () => {
    render(<ImportErrorDialog open={false} onDismiss={jest.fn()} />);
    expect(screen.queryByText("Couldn't import.")).not.toBeInTheDocument();
  });

  test('renders headline and body when open', () => {
    render(<ImportErrorDialog open onDismiss={jest.fn()} />);
    expect(screen.getByText("Couldn't import.")).toBeInTheDocument();
    expect(
      screen.getByText(/This file isn't a valid Axoview diagram/)
    ).toBeInTheDocument();
  });

  test('has a single primary dismiss action and no secondary action', () => {
    render(<ImportErrorDialog open onDismiss={jest.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });

  test('clicking OK calls onDismiss', async () => {
    const user = userEvent.setup();
    const onDismiss = jest.fn();
    render(<ImportErrorDialog open onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('Escape dismissal routes through onDismiss', async () => {
    const user = userEvent.setup();
    const onDismiss = jest.fn();
    render(<ImportErrorDialog open onDismiss={onDismiss} />);
    await user.keyboard('{Escape}');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('carries the data-axoview-id contract hook on the paper surface', () => {
    render(<ImportErrorDialog open onDismiss={jest.fn()} />);
    expect(
      document.querySelector('[data-axoview-id="dialog-import-error"]')
    ).not.toBeNull();
  });

  // A3/ZIP-08 — nine distinct ProjectZipError codes all reached the user as
  // "This file isn't a valid Axoview diagram", which is actively wrong for four
  // of them: a 200 MB archive, an incomplete archive and one from a newer
  // Axoview are all valid Axoview files.
  describe('failure-specific copy', () => {
    const bodyFor = (code: string) => {
      const { unmount } = render(
        <ImportErrorDialog open onDismiss={jest.fn()} error={{ code }} />
      );
      const text = document.body.textContent ?? '';
      unmount();
      return text;
    };

    test('a too-large archive is not called invalid', () => {
      expect(bodyFor('TOO_LARGE')).toMatch(/too large to import/);
    });

    test('a newer-version archive says to update Axoview', () => {
      expect(bodyFor('UNSUPPORTED_VERSION')).toMatch(/newer version of Axoview/);
    });

    test('an incomplete archive says what is missing', () => {
      expect(bodyFor('MISSING_DIAGRAM')).toMatch(/incomplete/);
      expect(bodyFor('BAD_DIAGRAM')).toMatch(/incomplete/);
    });

    test('a damaged manifest says damaged', () => {
      expect(bodyFor('BAD_MANIFEST')).toMatch(/damaged/);
      expect(bodyFor('BAD_FOLDER_GRAPH')).toMatch(/damaged/);
    });

    test('an unclassified failure keeps the generic copy', () => {
      expect(bodyFor('ZIP_ERROR')).toMatch(/isn't a valid Axoview diagram/);
    });

    test('no error at all keeps the generic copy', () => {
      render(<ImportErrorDialog open onDismiss={jest.fn()} />);
      expect(
        screen.getByText(/This file isn't a valid Axoview diagram/)
      ).toBeInTheDocument();
    });
  });
});
