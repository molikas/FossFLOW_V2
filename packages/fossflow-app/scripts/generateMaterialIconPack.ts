/**
 * generateMaterialIconPack.ts
 *
 * Prebuild script — reads raw .js files from @mui/icons-material, extracts the
 * SVG path data via regex, and writes material-icons-pack.json in the
 * @isoflow/isopacks format that iconPackManager already understands.
 *
 * Only the base (filled) variants are included — no Outlined / Rounded / Sharp /
 * TwoTone — keeping the pack at ~2 100 icons.
 *
 * Usage (added automatically via "prebuild" in package.json):
 *   npx ts-node scripts/generateMaterialIconPack.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ── paths ──────────────────────────────────────────────────────────────────────
const MUI_DIR = path.resolve(
  __dirname,
  '../../../node_modules/@mui/icons-material'
);
const OUTPUT_PATH = path.resolve(__dirname, '../src/assets/material-icons-pack.json');

// ── helpers ────────────────────────────────────────────────────────────────────

/** Convert PascalCase icon name → human-readable label, e.g. "HomeOutlined" → "Home Outlined" */
function toLabel(name: string): string {
  return name.replace(/([A-Z])/g, ' $1').trim();
}

interface PathItem {
  d: string;
  opacity?: string;
}

/**
 * Extract one or more SVG path objects from the raw CJS file content.
 *
 * Handles both single-path and multi-path (TwoTone-style) icons:
 *   single: (0, _jsxRuntime.jsx)("path", { d: "M10 20v..." })
 *   multi:  [(0, _jsxRuntime.jsx)("path", { d: "...", opacity: ".3" }, "0"), ...]
 */
function extractPaths(content: string): PathItem[] {
  const results: PathItem[] = [];

  // Match each {"path", { d: "...", ...}} block
  // We look for:  d: "..."  and optionally  opacity: "..."
  const blockRe = /"path",\s*\{([^}]+)\}/g;
  let block: RegExpExecArray | null;

  while ((block = blockRe.exec(content)) !== null) {
    const attrs = block[1];

    const dMatch = /\bd:\s*"([^"]+)"/.exec(attrs);
    if (!dMatch) continue;

    const opMatch = /opacity:\s*"([^"]+)"/.exec(attrs);

    results.push({
      d: dMatch[1],
      ...(opMatch ? { opacity: opMatch[1] } : {})
    });
  }

  return results;
}

/** Build an inline SVG data-URL from path items */
function buildSvgUrl(paths: PathItem[]): string {
  const pathEls = paths
    .map((p) => {
      const opAttr = p.opacity ? ` opacity="${p.opacity}"` : '';
      return `<path d="${p.d}"${opAttr}/>`;
    })
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${pathEls}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// ── main ───────────────────────────────────────────────────────────────────────

export interface MaterialIcon {
  id: string;
  name: string;
  collection: string;
  url: string;
}

export interface MaterialIconPack {
  name: string;
  icons: MaterialIcon[];
}

export function generatePack(): MaterialIconPack {
  const files = fs.readdirSync(MUI_DIR).filter((f) => {
    if (!f.endsWith('.js')) return false;
    // Exclude variant suffixes and utility files
    if (/Outlined|Rounded|Sharp|TwoTone/.test(f)) return false;
    if (/^(index|createSvg|utils)/.test(f)) return false;
    // Must start with uppercase (icon component names)
    if (!/^[A-Z]/.test(f)) return false;
    return true;
  });

  const icons: MaterialIcon[] = [];
  const seenIds = new Set<string>();

  for (const file of files) {
    const name = file.replace(/\.js$/, '');
    const id = `material_${name}`;

    if (seenIds.has(id)) continue;

    const content = fs.readFileSync(path.join(MUI_DIR, file), 'utf8');
    const paths = extractPaths(content);

    if (paths.length === 0) continue;

    seenIds.add(id);
    icons.push({
      id,
      name: toLabel(name),
      collection: 'material',
      url: buildSvgUrl(paths)
    });
  }

  return { name: 'material', icons };
}

// Run when executed directly (not imported as a module)
if (require.main === module) {
  console.log('Generating Material icon pack…');
  const pack = generatePack();
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(pack));
  console.log(`✓ Wrote ${pack.icons.length} icons → ${OUTPUT_PATH}`);
}
