import React from 'react';
import { Box } from '@mui/material';
import { RichTextEditor } from 'src/components/RichTextEditor/RichTextEditor';
import { stripHtmlTags } from 'src/utils/stripHtml';
import { CollapsibleSection } from './CollapsibleSection';

interface Props {
  /** Section title (already translated), e.g. "Notes". */
  title: string;
  value: string | undefined;
  onChange: (notes: string | undefined) => void;
  height?: number;
  /** Initial open state (uncontrolled). */
  defaultOpen?: boolean;
  /** Controlled open (used for the context-menu "Add note" focus deep-link). */
  open?: boolean;
  onToggle?: () => void;
  /**
   * View mode (EXPLORABLE_READONLY): the notes are still shown — they are the
   * point of the panel for a viewer — but the editor cannot write. F2/VIEW-11.
   */
  readOnly?: boolean;
}

const hasContent = (v?: string) => !!v && stripHtmlTags(v).trim() !== '';

// Shared collapsible rich-text Notes section (2026-07-02). Notes are available
// on every canvas element (node / connector / rectangle / text / label); the
// section is one of the deck's uniform collapsibles (ux-principles §5.1). The
// header carries a "has content" dot when notes exist. Empty content is written
// as `undefined` so an untouched Notes never dirties the model.
export const NotesSection = ({
  title,
  value,
  onChange,
  height = 200,
  defaultOpen = false,
  open,
  onToggle,
  readOnly = false
}: Props) => (
  <CollapsibleSection
    title={title}
    defaultOpen={defaultOpen}
    open={open}
    onToggle={onToggle}
    trailing={
      hasContent(value) ? (
        <Box
          component="span"
          aria-hidden
          sx={{
            ml: 0.75,
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: 'primary.main',
            display: 'inline-block'
          }}
        />
      ) : undefined
    }
  >
    <RichTextEditor
      value={value}
      height={height}
      readOnly={readOnly}
      onChange={
        readOnly
          ? undefined
          : (text) => {
              const empty = !hasContent(text);
              if (empty && !hasContent(value)) return;
              if (value !== text) onChange(empty ? undefined : text);
            }
      }
    />
  </CollapsibleSection>
);
