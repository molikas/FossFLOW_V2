// @ts-nocheck
/**
 * CLASS GATE (panel half) — read-only enforcement across every element panel.
 *
 * F2/VIEW-11: `RightSidebar` derived `readOnly` correctly and handed it to
 * exactly ONE of `ItemControlsManager`'s five element branches. The other four
 * took no such prop, so in view mode they rendered their full editing surface
 * and the edits stuck — typing in a Label's Notes editor wrote `label.notes` on
 * a diagram the viewer was only supposed to be reading.
 *
 * Every panel named in `readonlyPolicy.ELEMENT_PANEL_SURFACES` is rendered here
 * in BOTH modes, so a sixth panel (or a regressed fifth) fails without anyone
 * remembering to write a test. See the keyboard half in
 * `interaction/__tests__/readonlySurfaces.contract.test.ts`.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import { ELEMENT_PANEL_SURFACES } from 'src/interaction/readonlyPolicy';
import { ConnectorControls } from '../ConnectorControls/ConnectorControls';
import { TextBoxControls } from '../TextBoxControls/TextBoxControls';
import { LabelControls } from '../LabelControls/LabelControls';
import { RectangleControls } from '../RectangleControls/RectangleControls';
import { NodePanel } from '../NodeControls/NodePanel/NodePanel';

jest.mock('src/stores/localeStore', () => ({
  useTranslation: () => ({ t: (k: string) => k })
}));

const updates = {
  updateConnector: jest.fn(),
  updateTextBox: jest.fn(),
  updateLabel: jest.fn(),
  updateRectangle: jest.fn(),
  updateModelItem: jest.fn(),
  updateViewItem: jest.fn()
};
jest.mock('src/hooks/useScene', () => ({ useScene: () => updates }));

jest.mock('src/hooks/useModelItem', () => ({
  useModelItem: () => ({ id: 'n1', name: 'Node', notes: '<p>note</p>', icon: 'i1' })
}));
jest.mock('src/hooks/useConnector', () => ({
  useConnector: () => ({
    id: 'c1',
    name: 'Edge',
    notes: '<p>note</p>',
    labels: [],
    lineType: 'SINGLE'
  })
}));
jest.mock('src/hooks/useTextBox', () => ({
  useTextBox: () => ({ id: 't1', name: 'Text', notes: '<p>note</p>' })
}));
jest.mock('src/hooks/useLabel', () => ({
  useLabel: () => ({ id: 'l1', text: 'Label', notes: '<p>note</p>' })
}));
jest.mock('src/hooks/useRectangle', () => ({
  useRectangle: () => ({ id: 'r1', name: 'Rect', notes: '<p>note</p>' })
}));
jest.mock('src/hooks/useIcon', () => ({ useIcon: () => ({ icon: { url: '' } }) }));

jest.mock('src/stores/uiStateStore', () => {
  const state = {
    actions: {
      setItemControls: jest.fn(),
      setSelectedConnectorLabel: jest.fn()
    },
    selectedConnectorLabel: null,
    linkedDiagrams: []
  };
  return {
    useUiStateStore: (selector: (s: typeof state) => unknown) => selector(state)
  };
});

jest.mock('src/utils', () => ({
  getConnectorLabels: () => [],
  generateId: () => 'gen-id'
}));

// The real editor is a heavy contentEditable. Stand in for it with a marker that
// reports the one thing this gate cares about: whether it was mounted writable.
jest.mock('src/components/RichTextEditor/RichTextEditor', () => ({
  RichTextEditor: ({ readOnly }: { readOnly?: boolean }) => (
    <div data-testid={readOnly ? 'notes-readonly' : 'notes-writable'} />
  )
}));

const PANELS: Record<string, (readOnly: boolean) => React.ReactElement> = {
  ITEM: (readOnly) => (
    <NodePanel viewItem={{ id: 'n1', tile: { x: 0, y: 0 } }} readOnly={readOnly} />
  ),
  CONNECTOR: (readOnly) => <ConnectorControls id="c1" readOnly={readOnly} />,
  TEXTBOX: (readOnly) => <TextBoxControls id="t1" readOnly={readOnly} />,
  LABEL: (readOnly) => <LabelControls id="l1" readOnly={readOnly} />,
  RECTANGLE: (readOnly) => <RectangleControls id="r1" readOnly={readOnly} />
};

// The Notes section is one of the deck's collapsibles and unmounts its body when
// closed — and the panels disagree about the default (node/connector collapsed,
// the other three open). Expand it when it isn't already showing, so the assertion
// below is about writability and not about which panel happens to start open.
const mountNotesEditor = (type: string, readOnly: boolean) => {
  render(PANELS[type](readOnly));
  const mounted = () =>
    screen.queryByTestId('notes-writable') ?? screen.queryByTestId('notes-readonly');
  if (!mounted()) fireEvent.click(screen.getByText('notes'));
  expect(
    mounted() ? null : `the ${type} panel never mounted its Notes editor`
  ).toBeNull();
};

describe('class gate — every element panel is read-only in view mode', () => {
  it('covers exactly the panels the policy declares', () => {
    expect(Object.keys(PANELS).sort()).toEqual(
      Object.keys(ELEMENT_PANEL_SURFACES).sort()
    );
  });

  it.each(Object.keys(ELEMENT_PANEL_SURFACES))(
    'the %s panel mounts no writable Notes editor with readOnly',
    (type) => {
      mountNotesEditor(type, true);
      expect(screen.queryByTestId('notes-writable')).toBeNull();
    }
  );

  it.each(Object.keys(ELEMENT_PANEL_SURFACES))(
    'the %s panel IS writable without readOnly (the gate is not a blanket refusal)',
    (type) => {
      mountNotesEditor(type, false);
      expect(screen.queryByTestId('notes-writable')).not.toBeNull();
    }
  );
});

describe('class gate — ItemControlsManager forwards readOnly to every branch', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'ItemControlsManager.tsx'),
    'utf8'
  );

  it('the scan finds the switch (the gate can go red)', () => {
    expect(source).toContain('switch (itemControls?.type)');
  });

  it.each(Object.keys(ELEMENT_PANEL_SURFACES))(
    "the '%s' branch passes readOnly",
    (type) => {
      const start = source.indexOf(`case '${type}':`);
      expect(start).toBeGreaterThan(-1);
      const branch = source.slice(start, source.indexOf('case ', start + 6));
      expect(
        branch.includes('readOnly={readOnly}')
          ? null
          : `ItemControlsManager's '${type}' branch does not pass readOnly — ` +
              'that panel renders its editing surface to a viewer (VIEW-11).'
      ).toBeNull();
    }
  );
});
