import React, { useCallback } from 'react';
import {
  Stack,
  TextField,
  IconButton,
  Tooltip,
  Typography,
  Box,
  Autocomplete
} from '@mui/material';
import {
  InsertLink as InsertLinkIcon,
  OpenInNew as OpenInNewIcon
} from '@mui/icons-material';
import { ModelItem, ViewItem } from 'src/types';
import { RichTextEditor } from 'src/components/RichTextEditor/RichTextEditor';
import { useModelItem } from 'src/hooks/useModelItem';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { Section } from '../../components/Section';
import { useTranslation } from 'src/stores/localeStore';

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
  const { t } = useTranslation('nodeInfoTab');
  const { t: tPanel } = useTranslation('nodePanel');
  const modelItem = useModelItem(node.id);
  const linkedDiagrams = useUiStateStore((s) => s.linkedDiagrams);

  const handleToggleLink = useCallback(() => {
    if (showLink && modelItem?.headerLink) {
      onModelItemUpdated({ headerLink: undefined });
    }
    onShowLinkChange(!showLink);
  }, [showLink, modelItem?.headerLink, onModelItemUpdated, onShowLinkChange]);

  if (!modelItem) return null;

  const hasCaption =
    !!modelItem.description &&
    modelItem.description.replace(/<[^>]*>/g, '').trim() !== '';

  if (readOnly) {
    return (
      <Stack>
        {/* Name */}
        <Section title={t('name')}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
              {modelItem.name || '—'}
            </Typography>
            {modelItem.headerLink && (
              <Tooltip title={t('openLink')}>
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
          <Section title={t('caption')}>
            <RichTextEditor
              value={modelItem.description}
              readOnly
              height={80}
            />
          </Section>
        ) : (
          <Section>
            <Typography
              variant="body2"
              color="text.disabled"
              sx={{ fontStyle: 'italic' }}
            >
              {tPanel('noCaption')}
            </Typography>
          </Section>
        )}
      </Stack>
    );
  }

  return (
    <Stack>
      {/* Name */}
      <Section title={t('name')}>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <TextField
            inputRef={nameRef}
            value={modelItem.name}
            fullWidth
            placeholder={t('namePlaceholder')}
            size="small"
            onChange={(e) => {
              const text = e.target.value;
              if (modelItem.name !== text) onModelItemUpdated({ name: text });
            }}
          />
          <Tooltip title={showLink ? t('removeLink') : t('addLink')}>
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
            placeholder={t('linkPlaceholder')}
            fullWidth
            size="small"
            sx={{ mt: 1 }}
            onChange={(e) => {
              onModelItemUpdated({ headerLink: e.target.value || undefined });
            }}
          />
        )}
      </Section>

      {/* Link to diagram — only shown when diagrams are available */}
      {linkedDiagrams.length > 0 && (
        <Section title={t('diagramLink')}>
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ display: 'block', mb: 0.5 }}
          >
            {t('diagramLinkHint')}
          </Typography>
          <Autocomplete
            size="small"
            options={linkedDiagrams}
            getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt.name)}
            isOptionEqualToValue={(opt, val) => opt.id === val.id}
            value={linkedDiagrams.find((d) => d.id === modelItem.link) ?? null}
            onChange={(_e, newVal) => {
              onModelItemUpdated({ link: newVal?.id ?? undefined });
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder={t('diagramLinkPlaceholder')}
              />
            )}
            clearOnEscape
            handleHomeEndKeys={false}
          />
        </Section>
      )}

      {/* Caption — short text shown on the canvas under the node name */}
      <Section title={t('caption')}>
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ display: 'block', mb: 0.5 }}
        >
          {t('captionHint')}
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
