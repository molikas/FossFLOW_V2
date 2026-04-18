import { Box, Divider } from '@mui/material';
import { useDiagramLifecycle } from '../providers/DiagramLifecycleProvider';
import { FileExplorer } from '../components/fileExplorer/FileExplorer';

const PANEL_WIDTH = 280;

interface Props {
  children: React.ReactNode;
}

export function FileExplorerLayout({ children }: Props) {
  const { fileExplorerOpen } = useDiagramLifecycle();

  return (
    <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left panel — collapses to 0 when closed */}
      {fileExplorerOpen && (
        <>
          <Box
            sx={{
              width: PANEL_WIDTH,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              bgcolor: 'background.paper'
            }}
          >
            <FileExplorer />
          </Box>
          <Divider orientation="vertical" flexItem />
        </>
      )}

      {/* Main canvas area */}
      <Box component="main" sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {children}
      </Box>
    </Box>
  );
}
