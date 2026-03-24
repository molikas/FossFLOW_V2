import React, { useMemo, memo } from 'react';
import { Box, Typography } from '@mui/material';
import { toPx, CoordsUtils } from 'src/utils';
import { useIsoProjection } from 'src/hooks/useIsoProjection';
import { useTextBoxProps } from 'src/hooks/useTextBoxProps';
import { useScene } from 'src/hooks/useScene';

interface Props {
  textBox: ReturnType<typeof useScene>['textBoxes'][0];
}

export const TextBox = memo(({ textBox }: Props) => {
  const { paddingX, fontProps } = useTextBoxProps(textBox);

  const from = useMemo(() => {
    return CoordsUtils.add(textBox.tile, {
      x: 0,
      y: -(textBox.size.height - 1)
    });
  }, [textBox.tile, textBox.size.height]);

  const to = useMemo(() => {
    return CoordsUtils.add(textBox.tile, {
      x: textBox.size.width,
      y: 0
    });
  }, [textBox.tile, textBox.size.width]);

  const { css } = useIsoProjection({
    from,
    to,
    orientation: textBox.orientation
  });

  return (
    <Box style={css}>
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          display: 'flex',
          alignItems: 'flex-start',
          width: '100%',
          height: '100%',
          px: toPx(paddingX)
        }}
      >
        <Typography
          sx={{
            ...fontProps
          }}
        >
          {textBox.content?.trim().startsWith('<') ? (
            <span dangerouslySetInnerHTML={{ __html: textBox.content }} />
          ) : (
            textBox.content
          )}
        </Typography>
      </Box>
    </Box>
  );
});
