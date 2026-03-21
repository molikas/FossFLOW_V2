import { ModelItem, ViewItem, Connector, Rectangle, TextBox, Coords } from 'src/types';

export interface ClipboardItem {
  modelItem: ModelItem;
  viewItem: ViewItem;
}

export interface ClipboardPayload {
  items: ClipboardItem[];
  connectors: Connector[];
  rectangles: Rectangle[];
  textBoxes: TextBox[];
  centroid: Coords;
}

export interface PastePayload {
  items: ClipboardItem[];
  connectors: Connector[];
  rectangles: Rectangle[];
  textBoxes: TextBox[];
}

let _clipboard: ClipboardPayload | null = null;

export const setClipboard = (payload: ClipboardPayload): void => {
  _clipboard = payload;
};

export const getClipboard = (): ClipboardPayload | null => _clipboard;

export const hasClipboard = (): boolean => _clipboard !== null;
