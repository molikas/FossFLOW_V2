import React from 'react';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useLayerContext } from 'src/hooks/useLayerContext';
import { RectangleTransformControls } from './RectangleTransformControls';
import { TextBoxTransformControls } from './TextBoxTransformControls';
import { LabelTransformControls } from './LabelTransformControls';
import { NodeTransformControls } from './NodeTransformControls';
import { NodeGroupTransformControls } from './NodeGroupTransformControls';

export const TransformControlsManager = () => {
  const itemControls = useUiStateStore((state) => state.itemControls);
  const selectedIds = useUiStateStore((state) => state.selectedIds);
  const modeType = useUiStateStore((state) => state.mode.type);
  // An element on a LOCKED layer can still be selected (from the Layers list —
  // to inspect, re-layer, or unlock), but must not be transformable: render the
  // selection ring WITHOUT resize/rotate handles. Matches the interactable
  // invariant already enforced on the gesture path (useInteractionManager /
  // usePanHandlers) and industry behaviour (draw.io / PowerPoint / Canva show an
  // inert locked selection, never live handles). The canvas body-drag + inline
  // edit are already blocked for locked; handles were the remaining leak.
  // I5/CTX-06: `visibleIds` was missing entirely. Locked and hidden are two
  // different verdicts and the chrome owes them different answers:
  //
  //   LOCKED  → the entity is on screen and selectable, so it keeps its ring;
  //             only the resize/rotate handles go (the rule above).
  //   HIDDEN  → the entity is not drawn at all, so NO chrome belongs to it, and
  //             a group box spanning it would resize something the user cannot
  //             see. Measured before the fix: four live resize handles around a
  //             group whose bounds included a hidden-layer node.
  //
  // `layers.length === 0` is the "no layers configured" fallback every other
  // consumer uses — NOT `visibleIds.size`, which is also empty when every
  // entity is on a hidden layer (the layer-visibility regression).
  const { lockedIds, visibleIds, layers } = useLayerContext();
  const isVisible = (id: string) => layers.length === 0 || visibleIds.has(id);

  // Hide selection chrome while a move is in flight (owner 2026-07-04): the
  // drag is a CSS-only preview (DragItems, RECT-1) — the model tile doesn't
  // change until mouseup, so the bounds/anchors would sit frozen at the
  // ORIGIN tile while the item follows the cursor ("the resize box stays in
  // the original place"). Lucid/Figma hide handles mid-drag too; they return
  // wherever the selection lands after the drop.
  if (modeType === 'DRAG_ITEMS') {
    return null;
  }

  // Multi-selection.
  if (selectedIds.length > 1) {
    // ADR 0044 group-resize: a HOMOGENEOUS node selection gets one bounding-box
    // control that resizes every node together (each member shows its ring but
    // NOT its own handles, so it reads as "grab the group, not one node").
    // Suppress the group resize box if ANY member sits on a locked layer —
    // group-resizing would move a locked node. Members still show their rings.
    // Same for a HIDDEN member (CTX-06): the box would resize an entity that is
    // not on screen, and its bounds would extend to a place with nothing in it.
    const anyLocked = selectedIds.some((ref) => lockedIds.has(ref.id));
    const shown = selectedIds.filter((ref) => isVisible(ref.id));
    const anyHidden = shown.length !== selectedIds.length;
    const allNodes = selectedIds.every((ref) => ref.type === 'ITEM');
    if (allNodes) {
      return (
        <>
          {shown.map((ref) => (
            <NodeTransformControls
              key={`item-${ref.id}`}
              id={ref.id}
              showHandles={false}
            />
          ))}
          {!anyLocked && !anyHidden && (
            <NodeGroupTransformControls
              ids={shown.map((ref) => ref.id)}
            />
          )}
        </>
      );
    }

    // Mixed / non-node selection: per-item outlines. Nodes show a ring but no
    // resize handles — a cross-type resize isn't meaningful (matches the strip's
    // homogeneous-only bulk rule, ADR 0030).
    return (
      <>
        {shown.map((ref) => {
          switch (ref.type) {
            case 'ITEM':
              return (
                <NodeTransformControls
                  key={`item-${ref.id}`}
                  id={ref.id}
                  showHandles={false}
                />
              );
            case 'RECTANGLE':
              return (
                <RectangleTransformControls
                  key={`rect-${ref.id}`}
                  id={ref.id}
                  showHandles={!lockedIds.has(ref.id)}
                />
              );
            case 'TEXTBOX':
              return (
                <TextBoxTransformControls
                  key={`tb-${ref.id}`}
                  id={ref.id}
                  showHandles={!lockedIds.has(ref.id)}
                />
              );
            case 'LABEL':
              return (
                <LabelTransformControls key={`label-${ref.id}`} id={ref.id} />
              );
            // CONNECTOR / CONNECTOR_ANCHOR: no transform handles by design.
            default:
              return null;
          }
        })}
      </>
    );
  }

  // A single selected entity on a HIDDEN layer gets no chrome either — the ring
  // would be the only thing drawn at that tile (CTX-06). `ADD_ITEM` is the icon
  // picker, not an entity, so it has no id to check.
  if (
    itemControls &&
    itemControls.type !== 'ADD_ITEM' &&
    !isVisible(itemControls.id)
  ) {
    return null;
  }

  switch (itemControls?.type) {
    case 'ITEM':
      return (
        <NodeTransformControls
          id={itemControls.id}
          showHandles={!lockedIds.has(itemControls.id)}
        />
      );
    case 'RECTANGLE':
      return (
        <RectangleTransformControls
          id={itemControls.id}
          showHandles={!lockedIds.has(itemControls.id)}
        />
      );
    case 'TEXTBOX':
      return (
        <TextBoxTransformControls
          id={itemControls.id}
          showHandles={!lockedIds.has(itemControls.id)}
        />
      );
    // LABEL has no resize handles by design (sized via the strip); its outline
    // is already inert, so a locked label needs no extra gating here.
    case 'LABEL':
      return <LabelTransformControls id={itemControls.id} />;
    default:
      return null;
  }
};
