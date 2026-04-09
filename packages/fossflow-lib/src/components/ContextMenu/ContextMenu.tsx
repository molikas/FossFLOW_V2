import React from 'react';
import { Menu, MenuItem } from '@mui/material';

interface MenuItemI {
  label: string;
  onClick: () => void;
}

interface Props {
  onClose: () => void;
  anchorEl?: HTMLElement | null;
  menuItems: MenuItemI[];
}

export const ContextMenu = ({
  onClose,
  anchorEl,
  menuItems
}: Props) => {
  return (
    <Menu
      open={!!anchorEl}
      anchorEl={anchorEl}
      onClose={() => {
        // Restore focus to anchor before MUI sets aria-hidden on the modal root,
        // otherwise the browser warns about aria-hidden on a focused element.
        if (anchorEl) anchorEl.focus();
        onClose();
      }}
      PaperProps={{ 'data-testid': 'context-menu' } as any}
      MenuListProps={{ dense: true }}
    >
      {menuItems.map((item, index) => (
        <MenuItem
          key={index}
          onClick={item.onClick}
          sx={{ fontSize: 12, py: 0.5, minHeight: 32 }}
        >
          {item.label}
        </MenuItem>
      ))}
    </Menu>
  );
};
