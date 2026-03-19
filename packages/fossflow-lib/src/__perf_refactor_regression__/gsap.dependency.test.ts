/**
 * PERF REGRESSION — N-5: GSAP must not be a runtime dependency
 *
 * GSAP registers a global requestAnimationFrame ticker the moment its module
 * is initialised. Even with zero active tweens the ticker runs at 60 fps,
 * causing measurable idle CPU usage. We replaced the Grid GSAP animation
 * with direct style mutations. This suite confirms the removal is complete:
 *  - No source file imports gsap
 *  - The package.json dependency entry is gone
 */

import * as fs from 'fs';
import * as path from 'path';

const LIB_ROOT = path.resolve(__dirname, '../..');

// Recursively collect all .ts / .tsx source files (excluding tests, node_modules, dist)
function collectSourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '__perf_refactor_regression__', '__tests__'].includes(entry.name)) continue;
      collectSourceFiles(full, files);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx')) {
      files.push(full);
    }
  }
  return files;
}

describe('GSAP dependency — N-5 regression', () => {
  const srcDir = path.join(LIB_ROOT, 'src');
  const sourceFiles = collectSourceFiles(srcDir);

  it('no source file imports gsap', () => {
    const violators: string[] = [];
    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (/from ['"]gsap['"]|require\(['"]gsap['"]\)/.test(content)) {
        violators.push(path.relative(LIB_ROOT, file));
      }
    }
    if (violators.length > 0) {
      throw new Error(
        `Found gsap imports in source files (GSAP ticker would run at 60fps idle):\n  ${violators.join('\n  ')}`
      );
    }
  });

  it('gsap is not listed in package.json dependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(LIB_ROOT, 'package.json'), 'utf8'));
    expect(pkg.dependencies?.gsap).toBeUndefined();
    expect(pkg.devDependencies?.gsap).toBeUndefined();
    expect(pkg.peerDependencies?.gsap).toBeUndefined();
  });
});
