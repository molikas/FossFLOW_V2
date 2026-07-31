import React, { useEffect, useState } from 'react';
import { useLabel } from 'src/hooks/useLabel';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useScene } from 'src/hooks/useScene';
import { ControlsContainer } from '../components/ControlsContainer';
import { DeckHeader } from '../components/DeckHeader';
import { NotesSection } from '../components/NotesSection';
import { PANEL_EVENT } from 'src/components/NodeActionBar/NodeActionBar.helpers';
import { useTranslation } from 'src/stores/localeStore';

interface Props {
  id: string;
  /** View mode (EXPLORABLE_READONLY) — F2/VIEW-11. */
  readOnly?: boolean;
}

// Floating Label panel (ADR 0031). A Label is just on-canvas text: edited INLINE
// on the canvas (double-click, F2, or place-and-type) and styled from the top-bar
// strip — so the deck carries no content editor, only Notes. Unified
// collapsible-section deck (ux-principles §5.1). A Label's `text` is both its
// content and its identity, so there is no Metadata section either.
export const LabelControls = ({ id, readOnly = false }: Props) => {
  const { t } = useTranslation('textBoxControls');
  const { t: tMenu } = useTranslation('toolMenu');
  const uiStateActions = useUiStateStore((state) => state.actions);
  const label = useLabel(id);
  const { updateLabel } = useScene();
  const [notesOpen, setNotesOpen] = useState(true);

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent<string>).detail === 'focusNotes') setNotesOpen(true);
    };
    window.addEventListener(PANEL_EVENT.LABEL, handler);
    return () => window.removeEventListener(PANEL_EVENT.LABEL, handler);
  }, []);

  if (!label) return null;

  return (
    <ControlsContainer
      header={
        <DeckHeader
          type="LABEL"
          title={tMenu('label')}
          closeLabel={t('close')}
          onClose={() => uiStateActions.setItemControls(null)}
        />
      }
    >
      <NotesSection
        title={t('notes')}
        value={label.notes}
        onChange={(notes) => updateLabel(label.id, { notes })}
        open={notesOpen}
        onToggle={() => setNotesOpen((v) => !v)}
        readOnly={readOnly}
      />
    </ControlsContainer>
  );
};
