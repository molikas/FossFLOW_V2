import React from 'react';
import { Box, SxProps, Typography, Stack } from '@mui/material';

interface Props {
  children: React.ReactNode;
  title?: string;
  sx?: SxProps;
}

export const Section = ({ children, sx, title }: Props) => {
  return (
    <Box
      sx={{
        pt: 1.5,
        px: 2,
        ...sx
      }}
    >
      <Stack>
        {title && (
          <Typography
            variant="body2"
            color="text.secondary"
            textTransform="uppercase"
            pb={1}
          >
            {title}
          </Typography>
        )}
        {children}
      </Stack>
    </Box>
  );
};
