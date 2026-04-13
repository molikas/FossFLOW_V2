import { Box } from '@mui/material';

interface Props {
  children: React.ReactNode;
}

// Empty shell — left panel will be wired up in Phase 2B
export function FileExplorerLayout({ children }: Props) {
  return (
    <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left panel placeholder — Phase 2B */}
      <Box component="main" sx={{ flex: 1, overflow: 'hidden' }}>
        {children}
      </Box>
    </Box>
  );
}
