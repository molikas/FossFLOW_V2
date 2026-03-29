import React, { useCallback } from 'react';
import { Stack, TextField, IconButton, Tooltip, Typography, Box } from '@mui/material';
import {
  InsertLink as InsertLinkIcon,
  OpenInNew as OpenInNewIcon
} from '@mui/icons-material';
import { ModelItem, ViewItem } from 'src/types';
import { RichTextEditor } from 'src/components/RichTextEditor/RichTextEditor';
import { useModelItem } from 'src/hooks/useModelItem';
import { Section } from '../../components/Section';

interface Props {
  node: ViewItem;
  readOnly?: boolean;
  onModelItemUpdated: (updates: Partial<ModelItem>) => void;
  nameRef?: React.RefObject<HTMLInputElement | null>;
  linkRef?: React.RefObject<HTMLInputElement | null>;
  showLink: boolean;
  onShowLinkChange: (show: boolean) => void;
}

export const NodeInfoTab = ({
  node,
  readOnly,
  onModelItemUpdated,
  nameRef,
  linkRef,
  showLink,
  onShowLinkChange
}: Props) => {
  const modelItem = useModelItem(node.id);

  const handleToggleLink = useCallback(() => {
    if (showLink && modelItem?.headerLink) {
      onModelItemUpdated({ headerLink: undefined });
    }
    onShowLinkChange(!showLink);
  }, [showLink, modelItem?.headerLink, onModelItemUpdated, onShowLinkChange]);

  if (!modelItem) return null;

  const hasCaption =
    !!modelItem.description && modelItem.description.replace(/<[^>]*>/g, '').trim() !== '';

  if (readOnly) {
    return (
      <Stack>
        {/* Name */}
        <Section title="Name">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
              {modelItem.name || '—'}
            </Typography>
            {modelItem.headerLink && (
              <Tooltip title="Open link">
                <IconButton
                  size="small"
                  component="a"
                  href={
                    /^https?:\/\//i.test(modelItem.headerLink)
                      ? modelItem.headerLink
                      : `https://${modelItem.headerLink}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ p: 0.5 }}
                >
                  <OpenInNewIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Section>

        {/* Caption (canvas text) */}
        {hasCaption ? (
          <Section title="Caption">
            <RichTextEditor value={modelItem.description} readOnly height={80} />
          </Section>
        ) : (
          <Section>
            <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
              No caption.
            </Typography>
          </Section>
        )}
      </Stack>
    );
  }

  return (
    <Stack>
      {/* Name */}
      <Section title="Name">
        <Stack direction="row" spacing={0.5} alignItems="center">
          <TextField
            inputRef={nameRef}
            value={modelItem.name}
            fullWidth
            placeholder="Node name…"
            size="small"
            onChange={(e) => {
              const text = e.target.value;
              if (modelItem.name !== text) onModelItemUpdated({ name: text });
            }}
          />
          <Tooltip title={showLink ? 'Remove link' : 'Add link to name'}>
            <IconButton
              size="small"
              color={modelItem.headerLink ? 'primary' : 'default'}
              onClick={handleToggleLink}
            >
              <InsertLinkIcon />
            </IconButton>
          </Tooltip>
        </Stack>
        {showLink && (
          <TextField
            inputRef={linkRef}
            value={modelItem.headerLink || ''}
            placeholder="https://…"
            fullWidth
            size="small"
            sx={{ mt: 1 }}
            onChange={(e) => {
              onModelItemUpdated({ headerLink: e.target.value || undefined });
            }}
          />
        )}
      </Section>

      {/* Caption — short text shown on the canvas under the node name */}
      <Section title="Caption">
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 0.5 }}>
          Shown on the canvas below the node name
        </Typography>
        <RichTextEditor
          height={80}
          value={modelItem.description}
          onChange={(text) => {
            const hasContent = (val: string | undefined) =>
              !!val && val.replace(/<[^>]*>/g, '').trim() !== '';
            const isEmpty = !hasContent(text);
            const storedIsEmpty = !hasContent(modelItem.description);
            if (isEmpty && storedIsEmpty) return;
            if (modelItem.description !== text)
              onModelItemUpdated({ description: isEmpty ? undefined : text });
          }}
        />
      </Section>
    </Stack>
  );
};
