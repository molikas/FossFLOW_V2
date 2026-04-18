import { Box, Button, Paper } from '@mui/material';
import { AddCircleOutline as AddIcon } from '@mui/icons-material';

// ─── A/B test: flip this constant to compare, delete the unused branch when decided ───
const GRID_VARIANT: 'iso' | '2d' = 'iso';
// ─────────────────────────────────────────────────────────────────────────────────────

const SKY_BLUE = '#0ea5e9';

const gridBackground = {
  iso: {
    backgroundImage: [
      'repeating-linear-gradient(30deg,  rgba(128,128,128,0.13) 0, rgba(128,128,128,0.13) 1px, transparent 0, transparent 28px)',
      'repeating-linear-gradient(150deg, rgba(128,128,128,0.13) 0, rgba(128,128,128,0.13) 1px, transparent 0, transparent 28px)'
    ].join(', ')
  },
  '2d': {
    backgroundImage: [
      'repeating-linear-gradient(0deg,  rgba(128,128,128,0.1) 0, rgba(128,128,128,0.1) 1px, transparent 0, transparent 40px)',
      'repeating-linear-gradient(90deg, rgba(128,128,128,0.1) 0, rgba(128,128,128,0.1) 1px, transparent 0, transparent 40px)'
    ].join(', ')
  }
} as const;

interface Props {
  onCreate: () => void;
}

export function EmptyStateScreen({ onCreate }: Props) {
  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        bgcolor: 'background.default',
        ...gridBackground[GRID_VARIANT],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Paper
        elevation={3}
        sx={{
          width: 300,
          py: 4,
          px: 3,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          borderRadius: 3
        }}
      >
        <AddIcon sx={{ fontSize: 72, color: SKY_BLUE }} />

        <Button
          variant="contained"
          size="large"
          onClick={onCreate}
          sx={{
            bgcolor: SKY_BLUE,
            '&:hover': { bgcolor: '#0284c7' },
            px: 4,
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '1rem'
          }}
        >
          New diagram
        </Button>
      </Paper>
    </Box>
  );
}
