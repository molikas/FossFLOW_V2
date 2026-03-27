import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Box,
  Card,
  IconButton,
  Tooltip,
  TextField,
  Typography,
  useTheme
} from '@mui/material';
import { Add, Close, Edit, Check, ChevronRight } from '@mui/icons-material';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useScene } from 'src/hooks/useScene';
import { useTranslation } from 'src/stores/localeStore';

type EditingTarget = { kind: 'title' } | { kind: 'view'; id: string } | null;

export const ViewTabs = () => {
  const theme = useTheme();
  const { t } = useTranslation('viewTabs');

  const views = useModelStore((state) => state.views);
  const title = useModelStore((state) => state.title);
  const modelActions = useModelStore((state) => state.actions);
  const currentViewId = useUiStateStore((state) => state.view);
  const editorMode = useUiStateStore((state) => state.editorMode);
  const isReadonly = editorMode !== 'EDITABLE';
  const { createView, deleteView, updateView, switchView } = useScene();

  const [editing, setEditing] = useState<EditingTarget>(null);
  const [editingName, setEditingName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEdit = useCallback(
    (target: EditingTarget, currentName: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditing(target);
      setEditingName(currentName);
    },
    []
  );

  const commitEdit = useCallback(() => {
    const name = editingName.trim();
    if (name.length > 0 && editing) {
      if (editing.kind === 'title') {
        modelActions.set({ title: name });
      } else {
        updateView(editing.id, { name });
      }
    }
    setEditing(null);
    setEditingName('');
  }, [editing, editingName, modelActions, updateView]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
      } else if (e.key === 'Escape') {
        setEditing(null);
        setEditingName('');
      }
    },
    [commitEdit]
  );

  const handleTabClick = useCallback(
    (viewId: string) => {
      if (editing?.kind === 'view' && editing.id === viewId) return;
      switchView(viewId);
    },
    [editing, switchView]
  );

  const canDelete = views.length > 1;

  const cardBase = {
    borderRadius: 2,
    boxShadow: 1,
    p: 0,
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    px: 1.5,
    py: 0.75,
    minWidth: 120,
    maxWidth: 240,
    transition: 'background-color 0.15s'
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 0.5,
        pointerEvents: 'auto'
      }}
    >
      {/* Diagram title card — read-only; name is managed via Save / file manager */}
      <Card
        sx={{
          ...cardBase,
          backgroundColor: '#ffffff'
        }}
      >
        <Typography
          variant="body2"
          noWrap
          sx={{
            flexGrow: 1,
            fontWeight: 600,
            color: 'text.secondary',
            fontSize: '0.875rem',
            lineHeight: 1.5
          }}
        >
          {title}
        </Typography>
      </Card>

      <ChevronRight sx={{ color: 'text.disabled', width: 18, height: 18, flexShrink: 0 }} />

      {/* View tabs */}
      {views.map((view) => {
        const isActive = view.id === currentViewId;
        const isViewEditing = editing?.kind === 'view' && editing.id === view.id;

        return (
          <Box
            key={view.id}
            onClick={() => handleTabClick(view.id)}
            sx={{ cursor: 'pointer', display: 'flex' }}
          >
            <Card
              sx={{
                ...cardBase,
                backgroundColor: isActive ? theme.palette.primary.main : '#ffffff',
                '&:hover': isViewEditing
                  ? { backgroundColor: '#ffffff' }
                  : {
                      backgroundColor: isActive
                        ? theme.palette.primary.dark
                        : '#f5f5f5'
                    }
              }}
            >
              {isViewEditing ? (
                <TextField
                  inputRef={inputRef}
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={commitEdit}
                  onClick={(e) => e.stopPropagation()}
                  size="small"
                  variant="standard"
                  sx={{ flexGrow: 1, minWidth: 70, backgroundColor: 'transparent' }}
                  inputProps={{
                    style: { fontSize: '0.875rem', padding: 0, background: 'transparent', color: '#000000' }
                  }}
                />
              ) : (
                <Typography
                  variant="body2"
                  noWrap
                  sx={{
                    flexGrow: 1,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'white' : 'text.primary',
                    fontSize: '0.875rem',
                    lineHeight: 1.5
                  }}
                >
                  {view.name}
                </Typography>
              )}

              {!isReadonly && (isViewEditing ? (
                <Tooltip title={t('renameDiagram')}>
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); commitEdit(); }}
                    sx={{ ml: 0.5, p: 0.25 }}
                  >
                    <Check sx={{ width: 14, height: 14 }} />
                  </IconButton>
                </Tooltip>
              ) : (
                <Tooltip title={t('renameDiagram')}>
                  <IconButton
                    size="small"
                    onClick={(e) =>
                      startEdit({ kind: 'view', id: view.id }, view.name, e)
                    }
                    sx={{
                      ml: 0.5,
                      p: 0.25,
                      opacity: 0,
                      '&:hover': { opacity: 1 },
                      '.MuiCard-root:hover &': { opacity: 0.7 }
                    }}
                  >
                    <Edit sx={{ width: 13, height: 13, color: isActive ? 'white' : 'action' }} />
                  </IconButton>
                </Tooltip>
              ))}

              {!isReadonly && canDelete && !isViewEditing && (
                <Tooltip title={t('deletePage')}>
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); deleteView(view.id); }}
                    sx={{
                      ml: 0.25,
                      p: 0.25,
                      opacity: 0,
                      '&:hover': { opacity: 1 },
                      '.MuiCard-root:hover &': { opacity: 0.7 }
                    }}
                  >
                    <Close sx={{ width: 13, height: 13, color: isActive ? 'white' : 'action' }} />
                  </IconButton>
                </Tooltip>
              )}
            </Card>
          </Box>
        );
      })}

      {/* Add view button — editable mode only */}
      {!isReadonly && (
        <Tooltip title={t('addPage')}>
          <IconButton
            size="small"
            onClick={() => createView()}
            sx={{
              p: 0.75,
              backgroundColor: '#ffffff',
              border: 1,
              borderColor: 'grey.300',
              borderRadius: 1,
              '&:hover': { backgroundColor: '#f5f5f5' }
            }}
          >
            <Add sx={{ width: 16, height: 16 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};
