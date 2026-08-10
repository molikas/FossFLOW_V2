import React, { useState } from 'react';
import { Box, Collapse, TextField, Typography } from '@mui/material';
import { SectionDisclosure } from './SectionDisclosure';

interface Props {
  /** Section title (already translated), e.g. "Metadata". */
  title: string;
  /** The field's label (already translated), e.g. "Name". */
  fieldLabel: string;
  /** The identity name value. */
  name: string;
  /** Placeholder for the name input (already translated). */
  placeholder: string;
  onChange: (value: string) => void;
  /** Start expanded (default: collapsed — identity is secondary to content/Notes). */
  defaultExpanded?: boolean;
  /**
   * View mode (EXPLORABLE_READONLY): the name still reads, but the click-to-edit
   * affordance is withdrawn — there is no field to open. F2/VIEW-11.
   */
  readOnly?: boolean;
}

// Collapsible "Metadata" section holding an element's identity `name` (2026-07-02).
// Deliberately quiet: a plain-text disclosure (NOT a filled button — that read as
// the loudest thing in the panel) over a labeled key/value row. The value shows
// as text and turns into an inline field on click, so it reads like metadata
// rather than a bare input. Names are identity-only (renamed in Layers too).
export const MetadataSection = ({
  title,
  fieldLabel,
  name,
  placeholder,
  onChange,
  defaultExpanded = false,
  readOnly = false
}: Props) => {
  const [open, setOpen] = useState(defaultExpanded);
  const [editing, setEditing] = useState(false);
  const isEditing = editing && !readOnly;

  return (
    <Box sx={{ pt: 1.5, px: 2 }}>
      <SectionDisclosure
        title={title}
        open={open}
        onToggle={() => setOpen((v) => !v)}
      />

      <Collapse in={open} unmountOnExit>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 1.5,
            pl: 2.25,
            pt: 0.5,
            minHeight: 28
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ minWidth: 52, flexShrink: 0 }}
          >
            {fieldLabel}
          </Typography>
          {isEditing ? (
            <TextField
              value={name}
              placeholder={placeholder}
              size="small"
              variant="standard"
              autoFocus
              fullWidth
              onChange={(e) => onChange(e.target.value)}
              onBlur={() => setEditing(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  e.preventDefault();
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
            />
          ) : (
            <Typography
              variant="body2"
              onClick={readOnly ? undefined : () => setEditing(true)}
              sx={{
                flex: 1,
                cursor: readOnly ? 'default' : 'text',
                color: name ? 'text.primary' : 'text.disabled',
                borderRadius: 0.5,
                px: 0.5,
                mx: -0.5,
                ...(readOnly ? {} : { '&:hover': { bgcolor: 'action.hover' } })
              }}
            >
              {name || placeholder}
            </Typography>
          )}
        </Box>
      </Collapse>
    </Box>
  );
};
