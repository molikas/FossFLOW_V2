import React, { useEffect, useState } from 'react';
import { useTextBox } from 'src/hooks/useTextBox';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useScene } from 'src/hooks/useScene';
import { ControlsContainer } from '../components/ControlsContainer';
import { DeckHeader } from '../components/DeckHeader';
import { NotesSection } from '../components/NotesSection';
import { MetadataSection } from '../components/MetadataSection';
import { PANEL_EVENT } from 'src/components/NodeActionBar/NodeActionBar.helpers';
import { useTranslation } from 'src/stores/localeStore';

interface Props {
  id: string;
  /** View mode (EXPLORABLE_READONLY) — F2/VIEW-11. */
  readOnly?: boolean;
}

// Text panel (2026-07-02): a text box's on-canvas content is edited INLINE on the
// canvas (double-click, or place-and-type) and formatted from the top-bar style
// strip — which already carries the same rich-text popover the deck used to
// duplicate. So the deck has NO content editor: it leads with Notes (open), with
// the identity Name in a collapsed Metadata section. Unified collapsible-section
// deck (ux-principles §5.1); the top strip is the single styling surface (ADR 0030).
export const TextBoxControls = ({ id, readOnly = false }: Props) => {
  const { t } = useTranslation('textBoxControls');
  const { t: tMenu } = useTranslation('toolMenu');
  const uiStateActions = useUiStateStore((state) => state.actions);
  const textBox = useTextBox(id);
  const { updateTextBox } = useScene();
  const [notesOpen, setNotesOpen] = useState(true);

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent<string>).detail === 'focusNotes') setNotesOpen(true);
    };
    window.addEventListener(PANEL_EVENT.TEXTBOX, handler);
    return () => window.removeEventListener(PANEL_EVENT.TEXTBOX, handler);
  }, []);

  if (!textBox) return null;

  return (
    <ControlsContainer
      header={
        <DeckHeader
          type="TEXTBOX"
          title={tMenu('text')}
          closeLabel={t('close')}
          onClose={() => uiStateActions.setItemControls(null)}
        />
      }
    >
      <NotesSection
        title={t('notes')}
        value={textBox.notes}
        onChange={(notes) => updateTextBox(textBox.id, { notes })}
        open={notesOpen}
        onToggle={() => setNotesOpen((v) => !v)}
        readOnly={readOnly}
      />
      <MetadataSection
        title={t('metadata')}
        fieldLabel={t('name')}
        name={textBox.name ?? ''}
        placeholder={t('namePlaceholder')}
        onChange={(v) => updateTextBox(textBox.id, { name: v || undefined })}
        readOnly={readOnly}
      />
    </ControlsContainer>
  );
};
