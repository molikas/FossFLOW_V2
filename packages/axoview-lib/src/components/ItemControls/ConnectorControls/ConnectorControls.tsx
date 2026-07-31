import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { ConnectorLabel } from 'src/types';
import {
  Box,
  Button,
  Select,
  MenuItem,
  TextField,
  IconButton as MUIIconButton,
  Typography,
  Paper,
  Chip
} from '@mui/material';
import { useConnector } from 'src/hooks/useConnector';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useScene } from 'src/hooks/useScene';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { getConnectorLabels, generateId } from 'src/utils';
import { ControlsContainer } from '../components/ControlsContainer';
import { DeckHeader } from '../components/DeckHeader';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { MetadataSection } from '../components/MetadataSection';
import { NotesSection } from '../components/NotesSection';
import { PANEL_EVENT } from 'src/components/NodeActionBar/NodeActionBar.helpers';
import { useTranslation } from 'src/stores/localeStore';

// Connector panel (2026-07-02): the connector's on-canvas text is its
// `labels[]` (the lead content section, open by default); identity name lives
// in a collapsed Metadata section; the whole-connector link is the top-bar Link
// control. Line colour/style/type/width moved to the strip. Unified
// collapsible-section deck (ux-principles §5.1).

interface Props {
  id: string;
  /** View mode (EXPLORABLE_READONLY) — F2/VIEW-11. */
  readOnly?: boolean;
}

export const ConnectorControls = ({ id, readOnly = false }: Props) => {
  const { t } = useTranslation('connectorControls');
  const { t: tMenu } = useTranslation('toolMenu');
  const uiStateActions = useUiStateStore((state) => state.actions);
  const connector = useConnector(id);
  const { updateConnector } = useScene();
  // Per-label selection (shared with the canvas + top-bar style strip): clicking
  // a label card here selects it so the top bar targets it and the canvas
  // highlights it. Position/size/colour are set on the canvas + top bar now.
  const selectedConnectorLabel = useUiStateStore(
    (s) => s.selectedConnectorLabel
  );

  // The label just added from this panel — its Text field autofocuses so the
  // user can type immediately (no canvas editor; see handleAddLabel).
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  // Canvas context-menu "Add note" → open the Notes section.
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent<string>).detail === 'focusNotes') setNotesOpen(true);
    };
    window.addEventListener(PANEL_EVENT.CONNECTOR, handler);
    return () => window.removeEventListener(PANEL_EVENT.CONNECTOR, handler);
  }, []);

  const labels = useMemo(() => {
    if (!connector) return [];
    return getConnectorLabels(connector);
  }, [connector]);

  const handleAddLabel = useCallback(() => {
    if (!connector || labels.length >= 256) return;
    const newLabel: ConnectorLabel = {
      id: generateId(),
      text: '',
      position: 50,
      height: 0,
      line: '1'
    };
    updateConnector(connector.id, {
      labels: [...labels, newLabel],
      description: undefined,
      startLabel: undefined,
      endLabel: undefined,
      startLabelHeight: undefined,
      centerLabelHeight: undefined,
      endLabelHeight: undefined
    });
    uiStateActions.setSelectedConnectorLabel({
      connectorId: connector.id,
      labelId: newLabel.id
    });
    // Edit in the PANEL, not on canvas: the new card's Text field autofocuses
    // (justAddedId) so you can type immediately. Opening the canvas inline editor
    // here was the bug — its capture-phase pointer listener committed the empty
    // label (→ delete) the moment you clicked the panel field, so the card
    // vanished and the click "fell through" to the canvas.
    setJustAddedId(newLabel.id);
  }, [connector, labels, updateConnector, uiStateActions]);

  const handleUpdateLabel = useCallback(
    (labelId: string, updates: Partial<ConnectorLabel>) => {
      if (!connector) return;
      const updatedLabels = labels.map((label) =>
        label.id === labelId ? { ...label, ...updates } : label
      );
      updateConnector(connector.id, {
        labels: updatedLabels,
        description: undefined,
        startLabel: undefined,
        endLabel: undefined,
        startLabelHeight: undefined,
        centerLabelHeight: undefined,
        endLabelHeight: undefined
      });
    },
    [connector, labels, updateConnector]
  );

  const handleDeleteLabel = useCallback(
    (labelId: string) => {
      if (!connector) return;
      updateConnector(connector.id, {
        labels: labels.filter((l) => l.id !== labelId),
        description: undefined,
        startLabel: undefined,
        endLabel: undefined,
        startLabelHeight: undefined,
        centerLabelHeight: undefined,
        endLabelHeight: undefined
      });
    },
    [connector, labels, updateConnector]
  );

  if (!connector) return null;

  const isDoubleLineType =
    connector.lineType === 'DOUBLE' ||
    connector.lineType === 'DOUBLE_WITH_CIRCLE';

  return (
    <ControlsContainer
      header={
        <DeckHeader
          type="CONNECTOR"
          title={tMenu('connector')}
          closeLabel={t('close')}
          onClose={() => uiStateActions.setItemControls(null)}
        />
      }
    >
      {/* Labels — the connector's on-canvas content (positioned, styled labels
          along the path). Open by default; drag on the canvas to position, use
          the top bar for text size/colour. */}
      <CollapsibleSection
        title={t('labels')}
        defaultOpen
        trailing={
          labels.length > 0 ? (
            <Chip
              size="small"
              label={labels.length}
              sx={{ ml: 0.75, height: 18 }}
            />
          ) : undefined
        }
      >
        {!readOnly && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <Button
              startIcon={<AddIcon />}
              onClick={handleAddLabel}
              disabled={labels.length >= 256}
              size="small"
              variant="outlined"
            >
              {t('addLabel')}
            </Button>
          </Box>
        )}

        {labels.length === 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ textAlign: 'center', py: 1 }}
          >
            {t('noLabels')}
          </Typography>
        )}

        {labels.length > 0 && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mb: 1 }}
          >
            {t('positionHint')}
          </Typography>
        )}

        {labels.map((label, index) => {
          const isSelected =
            selectedConnectorLabel?.connectorId === connector.id &&
            selectedConnectorLabel.labelId === label.id;
          return (
            <Paper
              key={label.id}
              variant="outlined"
              onClick={() =>
                uiStateActions.setSelectedConnectorLabel({
                  connectorId: connector.id,
                  labelId: label.id
                })
              }
              sx={{
                p: 2,
                mb: 2,
                cursor: 'pointer',
                ...(isSelected
                  ? { outline: '2px solid', outlineColor: 'primary.main' }
                  : {})
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 1
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  {t('labelN').replace('{count}', String(index + 1))}
                </Typography>
                {!readOnly && (
                  <MUIIconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteLabel(label.id);
                    }}
                    color="error"
                  >
                    <DeleteIcon fontSize="small" />
                  </MUIIconButton>
                )}
              </Box>

              {/* No "Text" sublabel — the field inside a "Label {n}" card is
                  obviously the label's text, and "Text" here collided with the
                  section name (owner 2026-07-02, "kill inversions"). */}
              <TextField
                value={label.text}
                autoFocus={!readOnly && label.id === justAddedId}
                disabled={readOnly}
                onChange={(e) =>
                  handleUpdateLabel(label.id, { text: e.target.value })
                }
                // A label with no text has no reason to exist: clearing it and
                // blurring removes the label (matches the canvas inline-edit).
                onBlur={() => {
                  if (readOnly) return;
                  if (!label.text.trim()) handleDeleteLabel(label.id);
                }}
                fullWidth
                size="small"
                sx={{ mb: isDoubleLineType ? 2 : 1 }}
              />

              {isDoubleLineType && (
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {t('line')}
                  </Typography>
                  <Select
                    value={label.line || '1'}
                    disabled={readOnly}
                    onChange={(e) =>
                      handleUpdateLabel(label.id, {
                        line: e.target.value as '1' | '2'
                      })
                    }
                    fullWidth
                    size="small"
                  >
                    <MenuItem value="1">{t('line1')}</MenuItem>
                    <MenuItem value="2">{t('line2')}</MenuItem>
                  </Select>
                </Box>
              )}
              {/* "Show dotted line" (the label's leader line) is styling, so it
                  lives on the top style strip when this label is selected (#10) —
                  the deck stays content/notes only. */}
            </Paper>
          );
        })}
      </CollapsibleSection>

      <NotesSection
        title={t('notes')}
        value={connector.notes}
        onChange={(notes) => updateConnector(connector.id, { notes })}
        open={notesOpen}
        onToggle={() => setNotesOpen((v) => !v)}
        readOnly={readOnly}
      />

      <MetadataSection
        title={t('metadata')}
        fieldLabel={t('name')}
        name={connector.name ?? ''}
        placeholder={t('namePlaceholder')}
        onChange={(v) => updateConnector(connector.id, { name: v || undefined })}
        readOnly={readOnly}
      />
    </ControlsContainer>
  );
};
