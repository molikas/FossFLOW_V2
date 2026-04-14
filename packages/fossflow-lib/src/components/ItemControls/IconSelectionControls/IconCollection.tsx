import React, { useState } from 'react';
import { Box, Divider, Stack, Typography, Button } from '@mui/material';
import {
  ExpandMore as ChevronDownIcon,
  ExpandLess as ChevronUpIcon
} from '@mui/icons-material';
import { Icon as IconI } from 'src/types';
import { Section } from 'src/components/ItemControls/components/Section';
import { IconGrid } from './IconGrid';

// Collections larger than this render a limited preview to avoid freezing the
// browser with thousands of DOM nodes. Users can use the search box instead.
const LARGE_PACK_THRESHOLD = 100;
const PREVIEW_COUNT = 60;

interface Props {
  id?: string;
  icons: IconI[];
  onClick?: (icon: IconI) => void;
  onMouseDown?: (icon: IconI) => void;
  isExpanded: boolean;
}

export const IconCollection = ({
  id,
  icons,
  onClick,
  onMouseDown,
  isExpanded: _isExpanded
}: Props) => {
  const [isExpanded, setIsExpanded] = useState(_isExpanded);
  const isLargePack = icons.length > LARGE_PACK_THRESHOLD;

  return (
    <Section sx={{ py: 0 }}>
      <Button
        variant="text"
        fullWidth
        sx={{ py: 0.5, minHeight: 32 }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Stack
          sx={{ width: '100%' }}
          direction="row"
          spacing={1}
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography
            variant="caption"
            color="text.secondary"
            textTransform="uppercase"
            fontWeight={600}
            sx={{ letterSpacing: '0.05em', fontSize: 10 }}
          >
            {id}
            {isLargePack && (
              <Typography
                component="span"
                variant="caption"
                color="text.disabled"
                sx={{ ml: 0.5, fontSize: 10, textTransform: 'none', fontWeight: 400 }}
              >
                ({icons.length})
              </Typography>
            )}
          </Typography>
          {isExpanded ? (
            <ChevronUpIcon color="action" sx={{ fontSize: 16 }} />
          ) : (
            <ChevronDownIcon color="action" sx={{ fontSize: 16 }} />
          )}
        </Stack>
      </Button>
      <Divider />

      {isExpanded && (
        <Box sx={{ py: 0.5, px: 0.5 }}>
          <IconGrid
            icons={isLargePack ? icons.slice(0, PREVIEW_COUNT) : icons}
            onMouseDown={onMouseDown}
            onClick={onClick}
          />
          {isLargePack && (
            <Typography
              variant="caption"
              color="text.disabled"
              display="block"
              sx={{ mt: 0.5, px: 0.5, fontSize: 10, lineHeight: 1.4 }}
            >
              Showing {PREVIEW_COUNT} of {icons.length} — use search to find more
            </Typography>
          )}
        </Box>
      )}
    </Section>
  );
};
