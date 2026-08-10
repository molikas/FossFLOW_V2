// Pure helpers for the view-mode info popover (ADR 0012). Kept free of heavy
// component imports (ReactQuill etc.) so they're unit-testable in isolation.

import {
  Coords,
  ItemReference,
  ModelItem,
  ViewItem,
  Connector,
  TextBox,
  Label,
  Rectangle
} from 'src/types';
import { hasVisibleText } from 'src/components/NodeActionBar/NodeActionBar.helpers';
import { normalizeWebLinkUrl } from 'src/utils/quillLinkShortcut';

/**
 * Normalise a possibly-schemeless link for rendering.
 *
 * F2/VIEW-06 — this used to be its own `/^https?:\/\//i` allowlist, a second
 * normaliser for the same job written at a different time. Element-level
 * `headerLink`s are stored RAW (`TopBarStyleControls.onLinkChange`: "element
 * headerLinks keep their raw semantics"), so a user's `mailto:ops@example.com`
 * arrived here verbatim and was rendered as `https://mailto:ops@example.com` —
 * a dead URL. Same for `tel:` and a bare `#fragment`.
 *
 * There is one normaliser now. It stays an ALLOWLIST rather than a "does it
 * have a scheme?" check, because the prefixing is also what neutralises a
 * `javascript:` payload — swapping in a scheme test would turn a cosmetic bug
 * fix into an XSS vector.
 *
 * `normalizeWebLinkUrl` returns null for an empty string; the popover only
 * calls this with a non-empty `headerLink`, and the fallback keeps the return
 * type total for any other caller.
 */
export const toHref = (link: string): string =>
  normalizeWebLinkUrl(link) ?? `https://${link}`;

/**
 * The content gate: a popover appears only for items with a non-empty name,
 * notes with visible text, or a headerLink. Empty items show nothing.
 */
export const hasInfoPopoverContent = (
  name: string | undefined,
  notes: string | undefined,
  headerLink: string | undefined
): boolean => {
  const hasName = !!name?.trim();
  const hasNotes = !!notes && hasVisibleText(notes);
  return hasName || hasNotes || !!headerLink;
};

/** The per-type backing entities the popover's hooks resolve for the active
 *  reference — each null/undefined except the one matching the active type. */
export interface ItemInfoSources {
  modelItem?: ModelItem | null;
  viewItem?: ViewItem | null;
  connector?: Connector | null;
  textBox?: TextBox | null;
  label?: Label | null;
  rectangle?: Rectangle | null;
  /** Connectors have no single tile — the pin tile (pinned) or the cursor
   *  tile (hover) anchors their popover. */
  fallbackTile?: Coords;
}

export interface DerivedItemInfo {
  name?: string;
  notes?: string;
  headerLink?: string;
  anchorTile?: Coords;
  /**
   * Canvas-px residual applied AFTER getTilePosition (ADR 0023 off-grid
   * positioning). A floating-Label chip can be dragged off its home tile
   * (`label.offset`), so the popover must anchor at the CHIP, not the tile.
   */
  anchorOffset?: Coords;
}

/**
 * Per-type info derivation for the popover — name / notes / headerLink / the
 * canvas anchor. Notes parity is the contract: EVERY element type that can
 * carry `notes` (node, connector, text box, floating label, rectangle — see
 * the schemas) surfaces them here, since the hover gate (owner 2026-07-01)
 * shows a hover popover ONLY for items with notes. headerLink exists only on
 * ITEM / CONNECTOR / LABEL — the textBox / rectangle schemas have no such
 * field, so those types never emit one.
 */
export const deriveItemInfo = (
  type: ItemReference['type'],
  sources: ItemInfoSources
): DerivedItemInfo => {
  const { modelItem, viewItem, connector, textBox, label, rectangle } = sources;
  switch (type) {
    case 'ITEM':
      return {
        name: modelItem?.name,
        notes: modelItem?.notes,
        headerLink: modelItem?.headerLink,
        anchorTile: viewItem?.tile
      };
    case 'CONNECTOR':
      return {
        name: connector?.name || connector?.description,
        notes: connector?.notes,
        headerLink: connector?.headerLink,
        anchorTile: sources.fallbackTile
      };
    case 'TEXTBOX':
      return {
        name: textBox?.name,
        notes: textBox?.notes,
        anchorTile: textBox?.tile
      };
    case 'LABEL':
      return {
        // A Label's on-canvas text doubles as its identity (ADR 0031).
        name: label?.text,
        notes: label?.notes,
        headerLink: label?.headerLink,
        anchorTile: label?.tile,
        // Chips float off their home tile by a canvas-px offset — anchor the
        // popover where the chip is drawn (LabelHitLayer's cx/cy math).
        anchorOffset: label?.offset
      };
    case 'RECTANGLE':
      return {
        name: rectangle?.name,
        notes: rectangle?.notes,
        anchorTile: rectangle
          ? {
              x: (rectangle.from.x + rectangle.to.x) / 2,
              y: Math.min(rectangle.from.y, rectangle.to.y)
            }
          : undefined
      };
    default:
      return {};
  }
};
