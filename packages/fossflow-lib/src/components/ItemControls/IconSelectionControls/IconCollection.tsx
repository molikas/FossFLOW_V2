import React, { useState } from 'react';
import { Box, Divider, Stack, Typography, Button } from '@mui/material';
import {
  ExpandMore as ChevronDownIcon,
  ExpandLess as ChevronUpIcon
} from '@mui/icons-material';
import { Icon as IconI } from 'src/types';
import { Section } from 'src/components/ItemControls/components/Section';
import { IconGrid } from './IconGrid';

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
          <IconGrid icons={icons} onMouseDown={onMouseDown} onClick={onClick} />
        </Box>
      )}
    </Section>
  );
};
