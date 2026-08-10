import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TransformControlsManager } from '../TransformControlsManager';

/**
 * Promoted from the 2026-07 exploratory lane (I5/CTX-06).
 *
 * The transform chrome consulted `lockedIds` and never `visibleIds`, so a group
 * whose bounds included a node on a HIDDEN layer still got a live group resize
 * box — four working handles around geometry the user could not see. Locked and
 * hidden are two different verdicts and the chrome owes them different answers:
 * a locked entity is on screen and keeps its ring (handles only are withheld); a
 * hidden one is not drawn at all, so no chrome belongs to it.
 *
 * This is the affordance-layer half of the class ADR 0047 §3 names ("layer
 * visible/locked filter re-application in new paint/affordance layers"); the
 * enumerating gate lives in `SceneLayers/__tests__/layerFilter.contract.test.ts`.
 */

let mockUiState: {
  itemControls: { type: string; id: string } | null;
  selectedIds: { type: string; id: string }[];
  mode: { type: string };
};

let mockLayerContext: {
  lockedIds: Set<string>;
  visibleIds: Set<string>;
  layers: { id: string }[];
};

jest.mock('src/stores/uiStateStore', () => ({
  useUiStateStore: (selector: (s: typeof mockUiState) => unknown) =>
    selector(mockUiState)
}));

jest.mock('src/hooks/useLayerContext', () => ({
  useLayerContext: () => mockLayerContext
}));

jest.mock('../RectangleTransformControls', () => {
  const r = require('react');
  return {
    RectangleTransformControls: () =>
      r.createElement('div', { 'data-testid': 'chrome-rect' })
  };
});
jest.mock('../TextBoxTransformControls', () => {
  const r = require('react');
  return {
    TextBoxTransformControls: () =>
      r.createElement('div', { 'data-testid': 'chrome-tb' })
  };
});
jest.mock('../LabelTransformControls', () => {
  const r = require('react');
  return {
    LabelTransformControls: () =>
      r.createElement('div', { 'data-testid': 'chrome-label' })
  };
});
jest.mock('../NodeTransformControls', () => {
  const r = require('react');
  return {
    NodeTransformControls: ({ id }: { id: string }) =>
      r.createElement('div', { 'data-testid': `chrome-node-${id}` })
  };
});
jest.mock('../NodeGroupTransformControls', () => {
  const r = require('react');
  return {
    NodeGroupTransformControls: () =>
      r.createElement('div', { 'data-testid': 'chrome-group' })
  };
});

const LAYER = [{ id: 'layer-1' }];

beforeEach(() => {
  mockLayerContext = {
    lockedIds: new Set(),
    visibleIds: new Set(['a', 'b']),
    layers: LAYER
  };
});

describe('TransformControlsManager — the hidden-layer gate (CTX-06)', () => {
  it('suppresses the GROUP resize box when a member is on a hidden layer', () => {
    mockUiState = {
      itemControls: null,
      selectedIds: [
        { type: 'ITEM', id: 'a' },
        { type: 'ITEM', id: 'hidden' }
      ],
      mode: { type: 'CURSOR' }
    };

    render(<TransformControlsManager />);

    expect(screen.queryByTestId('chrome-group')).not.toBeInTheDocument();
    // The visible member still shows its ring…
    expect(screen.getByTestId('chrome-node-a')).toBeInTheDocument();
    // …and the hidden one shows nothing at all.
    expect(screen.queryByTestId('chrome-node-hidden')).not.toBeInTheDocument();
  });

  it('still draws the group box when every member is visible', () => {
    mockUiState = {
      itemControls: null,
      selectedIds: [
        { type: 'ITEM', id: 'a' },
        { type: 'ITEM', id: 'b' }
      ],
      mode: { type: 'CURSOR' }
    };

    render(<TransformControlsManager />);

    expect(screen.getByTestId('chrome-group')).toBeInTheDocument();
  });

  it('keeps suppressing it for a LOCKED member — the existing rule is intact', () => {
    mockLayerContext.lockedIds = new Set(['b']);
    mockUiState = {
      itemControls: null,
      selectedIds: [
        { type: 'ITEM', id: 'a' },
        { type: 'ITEM', id: 'b' }
      ],
      mode: { type: 'CURSOR' }
    };

    render(<TransformControlsManager />);

    expect(screen.queryByTestId('chrome-group')).not.toBeInTheDocument();
    // A locked entity IS on screen, so it keeps its ring — the difference
    // between the two verdicts.
    expect(screen.getByTestId('chrome-node-b')).toBeInTheDocument();
  });

  it('drops per-item chrome for hidden members of a MIXED selection', () => {
    mockUiState = {
      itemControls: null,
      selectedIds: [
        { type: 'RECTANGLE', id: 'a' },
        { type: 'TEXTBOX', id: 'hidden' }
      ],
      mode: { type: 'CURSOR' }
    };

    render(<TransformControlsManager />);

    expect(screen.getByTestId('chrome-rect')).toBeInTheDocument();
    expect(screen.queryByTestId('chrome-tb')).not.toBeInTheDocument();
  });

  it('renders nothing for a single selected entity on a hidden layer', () => {
    mockUiState = {
      itemControls: { type: 'RECTANGLE', id: 'hidden' },
      selectedIds: [{ type: 'RECTANGLE', id: 'hidden' }],
      mode: { type: 'CURSOR' }
    };

    const { container } = render(<TransformControlsManager />);
    expect(container).toBeEmptyDOMElement();
  });

  it('falls back to "all visible" when no layers are configured', () => {
    // NOT keyed on `visibleIds.size` — an empty set also means "every entity is
    // on a hidden layer", which must stay hidden (the layer-visibility
    // regression this fallback exists for).
    mockLayerContext = {
      lockedIds: new Set(),
      visibleIds: new Set(),
      layers: []
    };
    mockUiState = {
      itemControls: { type: 'RECTANGLE', id: 'anything' },
      selectedIds: [{ type: 'RECTANGLE', id: 'anything' }],
      mode: { type: 'CURSOR' }
    };

    render(<TransformControlsManager />);
    expect(screen.getByTestId('chrome-rect')).toBeInTheDocument();
  });

  it('with layers configured, an unlisted id is hidden', () => {
    mockUiState = {
      itemControls: { type: 'RECTANGLE', id: 'not-in-visible-set' },
      selectedIds: [{ type: 'RECTANGLE', id: 'not-in-visible-set' }],
      mode: { type: 'CURSOR' }
    };

    const { container } = render(<TransformControlsManager />);
    expect(container).toBeEmptyDOMElement();
  });
});
