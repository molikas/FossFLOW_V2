// Pure reactive selectors for scene data. No writes, no side effects.
// Components that only need to read scene state should prefer this hook
// over the full useScene() to avoid subscribing to action callbacks.

import { useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useModelStore } from 'src/stores/modelStore';
import { useSceneStore } from 'src/stores/sceneStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { RECTANGLE_DEFAULTS, TEXTBOX_DEFAULTS } from 'src/config';
import { getItemByIdOrThrow } from 'src/utils';

export const useSceneData = () => {
  const { views, colors, icons, items, version, title, description } =
    useModelStore(
      (state) => ({
        views: state.views,
        colors: state.colors,
        icons: state.icons,
        items: state.items,
        version: state.version,
        title: state.title,
        description: state.description
      }),
      shallow
    );

  // NOTE: sceneConnectors is used ONLY for hit-testing and interaction (getItemAtTile, Cursor).
  // Rendering (connectorsList) uses raw view connectors — each <Connector> fetches its own
  // path via useSceneStore. This prevents O(N) re-merge on every async path write.
  const { connectors: sceneConnectors, textBoxes: sceneTextBoxes } =
    useSceneStore(
      (state) => ({ connectors: state.connectors, textBoxes: state.textBoxes }),
      shallow
    );

  const currentViewId = useUiStateStore((state) => state.view);

  const currentView = useMemo(() => {
    if (!views || !currentViewId) {
      return {
        id: '',
        name: 'Default View',
        items: [],
        connectors: [],
        rectangles: [],
        textBoxes: []
      };
    }
    try {
      return getItemByIdOrThrow(views, currentViewId).value;
    } catch {
      return (
        views[0] || {
          id: currentViewId,
          name: 'Default View',
          items: [],
          connectors: [],
          rectangles: [],
          textBoxes: []
        }
      );
    }
  }, [currentViewId, views]);

  const itemsList = useMemo(() => currentView.items ?? [], [currentView.items]);
  const colorsList = useMemo(() => colors ?? [], [colors]);

  // Raw view connectors for RENDERING — no scene path merge here.
  const connectorsList = useMemo(
    () => currentView.connectors ?? [],
    [currentView.connectors]
  );

  // Merged connectors for HIT-TESTING — subscribes to sceneConnectors so interaction
  // always sees current paths.
  const hitConnectorsList = useMemo(
    () =>
      (currentView.connectors ?? []).map((connector) => {
        const sceneConnector = sceneConnectors?.[connector.id];
        return { ...connector, ...sceneConnector };
      }),
    [currentView.connectors, sceneConnectors]
  );

  const rectanglesList = useMemo(
    () =>
      (currentView.rectangles ?? []).map((r) => ({
        ...RECTANGLE_DEFAULTS,
        ...r
      })),
    [currentView.rectangles]
  );

  const textBoxesList = useMemo(
    () =>
      (currentView.textBoxes ?? []).map((textBox) => {
        const sceneTextBox = sceneTextBoxes?.[textBox.id];
        return { ...TEXTBOX_DEFAULTS, ...textBox, ...sceneTextBox };
      }),
    [currentView.textBoxes, sceneTextBoxes]
  );

  return {
    currentView,
    views,
    colors: colorsList,
    icons,
    items: itemsList,
    version,
    title,
    description,
    connectors: connectorsList,
    hitConnectors: hitConnectorsList,
    rectangles: rectanglesList,
    textBoxes: textBoxesList
  };
};
