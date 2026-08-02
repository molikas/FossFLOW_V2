/**
 * F2/VIEW-08 (owner ruling 2026-07-30) — **viewer session-only** projection.
 *
 * One shared `canvasMode` key. `/display` READS the stored value as its default,
 * so a viewer opens in whatever projection the editor last used — but a viewer
 * flipping iso<->2D to read someone else's diagram must not write it back and
 * reconfigure the authoring environment they open next. Editor persistence is
 * unchanged and there is no migration: the stored value is carried through
 * untouched from viewer mode.
 *
 * This is a persistence test rather than a store test because the decision lives
 * at the write site (`Axoview`'s settings effect), not in `setCanvasMode` — the
 * viewer's live projection genuinely does change, which is the whole feature.
 */
import React from 'react';
import { render, act } from '@testing-library/react';
import {
  UiStateProvider,
  useUiStateStore
} from 'src/stores/uiStateStore';
import {
  loadPersistedSettings,
  savePersistedSettings,
  persistableSettingsFor
} from 'src/config/persistedSettings';

// The SHIPPED rule, imported — not a copy of it. (An earlier draft of this file
// transcribed the branch out of `Axoview`'s effect, which is the probe-authoring
// trap F2/VIEW-04's own probe fell into: a copy cannot detect the original
// changing.) `persistFor` is only the thin write wrapper the effect performs.
const persistFor = (
  editorMode: string,
  settings: { canvasMode?: string; snapToGrid?: boolean }
) => {
  const toPersist = persistableSettingsFor(
    editorMode,
    settings as never,
    loadPersistedSettings()
  );
  if (toPersist) savePersistedSettings(toPersist);
};

const stored = () => loadPersistedSettings();

beforeEach(() => {
  localStorage.clear();
});

describe('VIEW-08 — a viewer\'s projection toggle is session-only', () => {
  it('the EDITOR still persists its projection', () => {
    // CONTROL first: if this ever fails, the viewer assertions below are
    // meaningless — nothing would be persisted either way.
    persistFor('EDITABLE', { canvasMode: '2D', snapToGrid: true });
    expect(stored()?.canvasMode).toBe('2D');
  });

  it('a VIEWER switching projection leaves the stored value alone', () => {
    persistFor('EDITABLE', { canvasMode: 'ISOMETRIC', snapToGrid: true });
    expect(stored()?.canvasMode).toBe('ISOMETRIC');

    // The viewer flips to 2D for their own reading of someone else's diagram.
    persistFor('EXPLORABLE_READONLY', { canvasMode: '2D', snapToGrid: true });
    expect(stored()?.canvasMode).toBe('ISOMETRIC');
  });

  it('and the viewer\'s OTHER settings still persist — only canvasMode is held back', () => {
    // Scoped to the one key the ruling names. Suppressing the whole write would
    // silently drop a viewer's zoom/label preferences too.
    persistFor('EDITABLE', { canvasMode: 'ISOMETRIC', snapToGrid: true });
    persistFor('EXPLORABLE_READONLY', { canvasMode: '2D', snapToGrid: false });
    expect(stored()?.snapToGrid).toBe(false);
    expect(stored()?.canvasMode).toBe('ISOMETRIC');
  });

  it('with nothing stored yet, a viewer writes no projection rather than theirs', () => {
    persistFor('EXPLORABLE_READONLY', { canvasMode: '2D', snapToGrid: true });
    expect(stored()?.canvasMode).toBeUndefined();
  });

  it('CONTROL: NON_INTERACTIVE persists nothing at all (ADR 0025)', () => {
    persistFor('NON_INTERACTIVE', { canvasMode: '2D', snapToGrid: false });
    expect(stored()).toBeNull();
  });
});

describe('VIEW-08 — the LIVE projection still changes for a viewer', () => {
  it('setCanvasMode is untouched — this is a persistence rule, not a lockout', () => {
    // The feature is "viewers can switch projection for their own view". If the
    // fix had been made in `setCanvasMode` it would have taken the feature away
    // instead of scoping its persistence.
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(UiStateProvider, null, children);
    let api: ReturnType<typeof useUiStateStore> | null = null;
    const Probe = () => {
      api = useUiStateStore((s) => s);
      return null;
    };
    render(React.createElement(Probe), { wrapper });
    act(() => {
      (api as never as { actions: { setEditorMode: (m: string) => void } }).actions.setEditorMode(
        'EXPLORABLE_READONLY'
      );
    });
    act(() => {
      (api as never as { actions: { setCanvasMode: (m: string) => void } }).actions.setCanvasMode(
        '2D'
      );
    });
    expect((api as never as { canvasMode: string }).canvasMode).toBe('2D');
  });
});
