import React, { useMemo, memo } from 'react';
import { Box, Typography, Stack } from '@mui/material';
import { PROJECTED_TILE_SIZE, DEFAULT_LABEL_HEIGHT } from 'src/config';
import { getTilePosition } from 'src/utils';
import { useIcon } from 'src/hooks/useIcon';
import { ViewItem } from 'src/types';
import { useModelItem } from 'src/hooks/useModelItem';
import { ExpandableLabel } from 'src/components/Label/ExpandableLabel';
import { RichTextEditor } from 'src/components/RichTextEditor/RichTextEditor';

interface Props {
  node: ViewItem;
  order: number;
}

export const Node = memo(({ node, order }: Props) => {
  const modelItem = useModelItem(node.id);
  const { iconComponent } = useIcon(modelItem?.icon);

  const position = useMemo(() => {
    return getTilePosition({
      tile: node.tile,
      origin: 'BOTTOM'
    });
  }, [node.tile]);

  const description = useMemo(() => {
    if (!modelItem?.description) return null;
    // Strip all HTML tags to check for visible text — handles all Quill empty
    // variants (<p><br></p>, <p><br/></p>, whitespace-only, etc.)
    const visible = modelItem.description.replace(/<[^>]*>/g, '').trim();
    return visible ? modelItem.description : null;
  }, [modelItem?.description]);

  // If modelItem doesn't exist, don't render the node
  if (!modelItem) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'absolute',
        zIndex: order
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          left: position.x,
          top: position.y - PROJECTED_TILE_SIZE.height / 2
        }}
      >
        {(modelItem?.name || description) && (
          <Box data-testid="node-label">
            <ExpandableLabel
              maxWidth={250}
              expandDirection="BOTTOM"
              labelHeight={node.labelHeight ?? DEFAULT_LABEL_HEIGHT}
            >
              <Stack spacing={1}>
                {modelItem.name && (
                  <Typography
                    fontWeight={600}
                    fontSize={node.labelFontSize ?? 14}
                    color={node.labelColor || 'text.primary'}
                  >
                    {modelItem.headerLink ? (
                      <a
                        href="#"
                        data-testid="node-header-link"
                        style={{
                          color: 'inherit',
                          textDecoration: 'underline',
                          cursor: 'pointer'
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const url = /^https?:\/\//i.test(
                            modelItem.headerLink!
                          )
                            ? modelItem.headerLink!
                            : `https://${modelItem.headerLink}`;
                          window.open(url, '_blank', 'noopener,noreferrer');
                        }}
                      >
                        {modelItem.name}
                      </a>
                    ) : (
                      modelItem.name
                    )}
                  </Typography>
                )}
                {description && <RichTextEditor value={description} readOnly />}
              </Stack>
            </ExpandableLabel>
          </Box>
        )}
        {iconComponent && (
          <Box
            sx={{
              pointerEvents: 'none',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              position: 'relative'
            }}
          >
            {iconComponent}
            {modelItem.notes &&
              modelItem.notes.replace(/<[^>]*>/g, '').trim() && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    bgcolor: '#1565c0',
                    border: '2px solid #fff',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                />
              )}
          </Box>
        )}
      </Box>
    </Box>
  );
});
