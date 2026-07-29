import type {
  Model,
  ModelItem,
  Connector,
  ConnectorAnchor,
  View,
  Rectangle
} from 'src/types';
// Deep import, NOT the `src/utils` barrel — deliberate. The barrel re-exports
// `./model`, which imports `validateModel` back from this file, so going through
// it forms a genuine runtime value cycle (validation → utils/index → utils/model
// → validation). It survives today only because both bindings are referenced
// lazily inside function bodies; a module-level use on either side would be a
// TDZ crash at import. `isoMath` pulls only deep paths and never reaches
// `schemas`, so this edge is acyclic. Removing this one barrel hop dropped the
// graph from 63 cycles to 47 (2026-07-29 review §5).
import { getAllAnchors } from 'src/utils/isoMath';

type IssueType =
  | {
      type: 'INVALID_ANCHOR_TO_VIEW_ITEM_REF';
      params: {
        anchor: string;
        viewItem: string;
        view: string;
        connector: string;
      };
    }
  | {
      type: 'INVALID_CONNECTOR_COLOR_REF';
      params: {
        connector: string;
        view: string;
        color: string;
      };
    }
  | {
      type: 'INVALID_RECTANGLE_COLOR_REF';
      params: {
        rectangle: string;
        view: string;
        color: string;
      };
    }
  | {
      type: 'INVALID_ANCHOR_TO_ANCHOR_REF';
      params: {
        srcAnchor: string;
        destAnchor: string;
        view: string;
        connector: string;
      };
    }
  | {
      type: 'INVALID_VIEW_ITEM_TO_MODEL_ITEM_REF';
      params: {
        view: string;
        modelItem: string;
      };
    }
  | {
      type: 'INVALID_ANCHOR_REF';
      params: {
        anchor: string;
        view: string;
        connector: string;
      };
    }
  | {
      type: 'CONNECTOR_TOO_FEW_ANCHORS';
      params: {
        connector: string;
        view: string;
      };
    };

type Issue = IssueType & {
  message: string;
};

export const validateConnectorAnchor = (
  anchor: ConnectorAnchor,
  ctx: {
    view: View;
    connector: Connector;
    // O(1) membership sets, built once per validateView (VALIDATE-2). Replaces
    // the per-anchor linear getItemByIdOrThrow / Array.includes scans, which
    // made connector validation O(C·A·N).
    viewItemIds: Set<string>;
    anchorIds: Set<string>;
  }
): Issue[] => {
  const issues: Issue[] = [];

  if (Object.keys(anchor.ref).length !== 1) {
    issues.push({
      type: 'INVALID_ANCHOR_REF',
      params: {
        anchor: anchor.id,
        view: ctx.view.id,
        connector: ctx.connector.id
      },
      message:
        'Connector includes an anchor that references more than one item.  An anchor can only reference one item.'
    });
  }

  if (anchor.ref.item && !ctx.viewItemIds.has(anchor.ref.item)) {
    // Dangling ref: the anchor references an item not present in this view.
    issues.push({
      type: 'INVALID_ANCHOR_TO_VIEW_ITEM_REF',
      params: {
        anchor: anchor.id,
        viewItem: anchor.ref.item,
        view: ctx.view.id,
        connector: ctx.connector.id
      },
      message:
        'Connector includes an anchor that references an item that does not exist in this view.'
    });
  }

  if (anchor.ref.anchor && !ctx.anchorIds.has(anchor.ref.anchor)) {
    // Dangling ref: the anchor references another anchor not present in the view.
    issues.push({
      type: 'INVALID_ANCHOR_TO_ANCHOR_REF',
      params: {
        destAnchor: anchor.id,
        srcAnchor: anchor.ref.anchor,
        view: ctx.view.id,
        connector: ctx.connector.id
      },
      message:
        'Connector includes an anchor that references another connector anchor that does not exist in this view.'
    });
  }

  return issues;
};

export const validateConnector = (
  connector: Connector,
  ctx: {
    view: View;
    viewItemIds: Set<string>;
    anchorIds: Set<string>;
    colorIds: Set<string>;
  }
): Issue[] => {
  const issues: Issue[] = [];

  if (connector.color && !ctx.colorIds.has(connector.color)) {
    // Dangling ref: the connector references a color not present in the model.
    issues.push({
      type: 'INVALID_CONNECTOR_COLOR_REF',
      params: {
        connector: connector.id,
        view: ctx.view.id,
        color: connector.color
      },
      message: 'Connector references a color that does not exist in the model.'
    });
  }

  if (connector.anchors.length < 2) {
    issues.push({
      type: 'CONNECTOR_TOO_FEW_ANCHORS',
      params: {
        connector: connector.id,
        view: ctx.view.id
      },
      message:
        'Connector must have at least two anchors.  One for the source and one for the target.'
    });
  }

  const { anchors } = connector;

  anchors.forEach((anchor) => {
    const anchorIssues = validateConnectorAnchor(anchor, {
      view: ctx.view,
      connector,
      viewItemIds: ctx.viewItemIds,
      anchorIds: ctx.anchorIds
    });

    issues.push(...anchorIssues);
  });

  return issues;
};

export const validateRectangle = (
  rectangle: Rectangle,
  ctx: { view: View; colorIds: Set<string> }
): Issue[] => {
  const issues: Issue[] = [];

  if (rectangle.color && !ctx.colorIds.has(rectangle.color)) {
    // Dangling ref: the rectangle references a color not present in the model.
    issues.push({
      type: 'INVALID_RECTANGLE_COLOR_REF',
      params: {
        rectangle: rectangle.id,
        view: ctx.view.id,
        color: rectangle.color
      },
      message: 'Rectangle references a color that does not exist in the model.'
    });
  }

  return issues;
};

export const validateView = (view: View, ctx: { model: Model }): Issue[] => {
  const issues: Issue[] = [];

  // O(1) membership sets, built once. These replace the per-item / per-anchor
  // linear getItemByIdOrThrow / Array.includes scans throughout validation.
  // The view-item ref check was the O(N^3) paste-freeze driver (PASTE-1); the
  // connector/anchor checks were the next cliff at O(C·A·N) (VALIDATE-2).
  const modelItemIds = new Set(ctx.model.items.map((i) => i.id));
  const colorIds = new Set(ctx.model.colors.map((c) => c.id));

  if (view.connectors) {
    const allAnchors = getAllAnchors(view.connectors);
    // Aggregated across ALL connectors in the view (matches getAllAnchors) so
    // an anchor→anchor ref to a sibling connector's anchor validates.
    const anchorIds = new Set(allAnchors.map((a) => a.id));
    const viewItemIds = new Set(view.items.map((i) => i.id));

    view.connectors.forEach((connector) => {
      issues.push(
        ...validateConnector(connector, {
          view,
          viewItemIds,
          anchorIds,
          colorIds
        })
      );
    });
  }

  if (view.rectangles) {
    view.rectangles.forEach((rectangle) => {
      issues.push(...validateRectangle(rectangle, { view, colorIds }));
    });
  }

  view.items.forEach((viewItem) => {
    if (!modelItemIds.has(viewItem.id)) {
      // Dangling ref: the view item references a model item that does not exist.
      issues.push({
        type: 'INVALID_VIEW_ITEM_TO_MODEL_ITEM_REF',
        params: {
          modelItem: viewItem.id,
          view: view.id
        },
        message:
          'Invalid item in view.  The item references a non-existant item in the model.'
      });
    }
  });

  return issues;
};

export const validateModelItem = (
  _modelItem: ModelItem,
  _ctx: { model: Model }
): Issue[] => {
  // Icon references are intentionally not validated here: icons may come from
  // external icon packs that are loaded separately and are not stored in model.icons.
  return [];
};

export const validateModel = (model: Model): Issue[] => {
  const issues: Issue[] = [];

  model.items.forEach((modelItem) => {
    issues.push(...validateModelItem(modelItem, { model }));
  });

  model.views.forEach((view) => {
    issues.push(...validateView(view, { model }));
  });

  return issues;
};
