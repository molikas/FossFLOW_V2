import React, { useEffect, useState } from 'react';
import { useRectangle } from 'src/hooks/useRectangle';
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

// Rectangle panel (2026-07-02): all visual styling lives on the top-bar style
// strip, so the deck has no text content — it leads with Notes (open by
// default), with the identity Name tucked into a collapsed Metadata section
// (names are Layers-first). Unified collapsible-section deck (ux-principles §5.1).
export const RectangleControls = ({ id, readOnly = false }: Props) => {
  const { t } = useTranslation('rectangleControls');
  const { t: tMenu } = useTranslation('toolMenu');
  const uiStateActions = useUiStateStore((state) => state.actions);
  const rectangle = useRectangle(id);
  const { updateRectangle } = useScene();
  // Notes is the rectangle's lead section (no text field), so it starts open;
  // the context-menu "Add note" also opens it.
  const [notesOpen, setNotesOpen] = useState(true);

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent<string>).detail === 'focusNotes') setNotesOpen(true);
    };
    window.addEventListener(PANEL_EVENT.RECTANGLE, handler);
    return () => window.removeEventListener(PANEL_EVENT.RECTANGLE, handler);
  }, []);

  if (!rectangle) return null;

  return (
    <ControlsContainer
      header={
        <DeckHeader
          type="RECTANGLE"
          title={tMenu('rectangle')}
          closeLabel={t('close')}
          onClose={() => uiStateActions.setItemControls(null)}
        />
      }
    >
      <NotesSection
        title={t('notes')}
        value={rectangle.notes}
        onChange={(notes) => updateRectangle(rectangle.id, { notes })}
        open={notesOpen}
        onToggle={() => setNotesOpen((v) => !v)}
        readOnly={readOnly}
      />
      <MetadataSection
        title={t('metadata')}
        fieldLabel={t('name')}
        name={rectangle.name ?? ''}
        placeholder={t('namePlaceholder')}
        onChange={(v) => updateRectangle(rectangle.id, { name: v || undefined })}
        readOnly={readOnly}
      />
    </ControlsContainer>
  );
};
