/**
 * CLASS GATE — no two-argument `expect` in a Jest-context test file
 * (ADR 0047 §3; owner ruling 2026-07-31).
 *
 * The class, in one sentence: **Playwright's `expect(value, 'message')` and
 * Jest's `expect(value)` look identical and are not.** Jest throws
 * `"Expect takes at most one argument."`, so a test written in the Playwright
 * style is RED whatever the code does.
 *
 * Wave 3 hit this for real. An OVL-14 probe was written with the two-argument
 * form and read as a confirmed bug; the code was fine. That is the most
 * expensive kind of rig fault — it does not look like a rig fault, it looks
 * like evidence, and the campaign's whole value is that its evidence is
 * trustworthy.
 *
 * WHY THIS GATE EXISTS AT ALL, given no lane is present today. Three reasons,
 * and they are the owner's:
 *   1. the explore MECHANISM is permanent (ADR 0047); between campaigns the
 *      lane is empty (2026-08-10 amendment), but a campaign RECREATES the
 *      `__explore__` trees, and this gate covers them by construction — the
 *      sweep walks the whole `src` tree, so any lane a campaign adds is scanned;
 *   2. future delta campaigns will write NEW Jest probes, by agents that have
 *      just been reading Playwright specs;
 *   3. this class has already produced one false CONFIRMED verdict, so its
 *      prior is not hypothetical.
 *
 * SCOPE — any lane files present are scanned as DATA, not executed. The lane
 * stays excluded from `npm test`, from `tsc --noEmit` and from knip (ADR 0047
 * quarantine); reading its files with `fs` breaks none of that, and it is the
 * only way a main-suite gate can protect a quarantined tree.
 *
 * Playwright specs are deliberately NOT scanned: the two-argument form is
 * legal there and used ~180 times, including the campaign's own e2e invariant
 * fixture. A gate that flagged those would be noise, and (worse) would train
 * whoever silences it to silence the real hits too.
 *
 * WHY A SCANNER AND NOT A REGEX. `expect(keyIn(layers, 'high'))` contains a
 * comma and a quote inside its ONE argument, and a regex flags it. All three
 * hits from the naive pattern on this repo were exactly that shape. The check
 * has to find a comma at paren depth ZERO, outside strings and template
 * literals, which is a scan.
 */
import fs from 'fs';
import path from 'path';

const REPO = path.join(__dirname, '..', '..', '..', '..');

// ---------------------------------------------------------------------------
// The scanner
// ---------------------------------------------------------------------------

/**
 * Byte offsets of every `expect(` whose argument list contains a top-level
 * comma — i.e. every call Jest would reject with "Expect takes at most one
 * argument."
 *
 * Comment- and string-aware: an `expect(` written inside a comment (this file's
 * own prose, for one) is not a call, and a comma inside a string, a template
 * literal, a nested call, an array or an object literal is not a top-level one.
 */
export const findTwoArgExpects = (
  source: string
): { index: number; line: number }[] => {
  const hits: { index: number; line: number }[] = [];
  const lineOf = (idx: number) => source.slice(0, idx).split('\n').length;

  let i = 0;
  const n = source.length;
  // Skip comments and strings while looking for the next `expect(`.
  while (i < n) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const nl = source.indexOf('\n', i);
      i = nl === -1 ? n : nl + 1;
      continue;
    }
    if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(source, i);
      continue;
    }
    if (
      source.startsWith('expect(', i) &&
      // `.expect(`, `superExpect(` … are other functions. Require the token to
      // start a word.
      !/[\w$.]/.test(source[i - 1] ?? '')
    ) {
      const open = i + 'expect('.length - 1;
      if (hasTopLevelComma(source, open)) {
        hits.push({ index: i, line: lineOf(i) });
      }
      i = open + 1;
      continue;
    }
    i += 1;
  }
  return hits;
};

/** Index just past the string/template literal that starts at `start`. */
const skipString = (source: string, start: number): number => {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    // A template literal's `${…}` can hold anything, including quotes and
    // parens — walk it with the same depth logic rather than scanning for the
    // closing backtick naively.
    if (quote === '`' && ch === '$' && source[i + 1] === '{') {
      let depth = 1;
      i += 2;
      while (i < source.length && depth > 0) {
        const c = source[i];
        if (c === '{') depth += 1;
        else if (c === '}') depth -= 1;
        else if (c === '"' || c === "'" || c === '`') {
          i = skipString(source, i);
          continue;
        }
        i += 1;
      }
      continue;
    }
    if (ch === quote) return i + 1;
    i += 1;
  }
  return source.length;
};

/** Does the argument list opening at `open` contain a comma at depth 0? */
const hasTopLevelComma = (source: string, open: number): boolean => {
  let depth = 0;
  let i = open;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(source, i);
      continue;
    }
    if (source.startsWith('//', i)) {
      const nl = source.indexOf('\n', i);
      i = nl === -1 ? source.length : nl + 1;
      continue;
    }
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) return false; // closed the argument list, no top-level comma
    } else if (ch === ',' && depth === 1) return true;
    i += 1;
  }
  return false;
};

// ---------------------------------------------------------------------------
// §1 — the scanner itself (pinned samples, both directions)
// ---------------------------------------------------------------------------

describe('class gate §1 — the scanner distinguishes the two forms', () => {
  it('flags the Playwright form', () => {
    expect(findTwoArgExpects("expect(value, 'a message').toBe(1);")).toHaveLength(
      1
    );
  });

  it('does NOT flag a comma inside the single argument', () => {
    // Every false positive the naive regex produced on this repo was this
    // shape — a nested call whose own arguments contain a comma and a quote.
    const samples = [
      "expect(keyIn(layers, 'high')).toBeGreaterThan(0);",
      'expect(fn(a, b)).toBe(1);',
      'expect([1, 2, 3]).toHaveLength(3);',
      'expect({ a: 1, b: 2 }).toEqual(other);',
      'expect(`${a}, ${b}`).toBe(x);',
      'expect(list.map((x, i) => x + i)).toEqual([1]);'
    ];
    samples.forEach((s) => {
      expect(findTwoArgExpects(s)).toHaveLength(0);
    });
  });

  it('is not fooled by a comma inside a string', () => {
    expect(findTwoArgExpects(`expect('a, b').toBe('a, b');`)).toHaveLength(0);
  });

  it('ignores `expect(` written in a comment', () => {
    expect(
      findTwoArgExpects("// expect(value, 'msg') — prose, not a call\n")
    ).toHaveLength(0);
    expect(
      findTwoArgExpects("/* expect(value, 'msg') */\nexpect(x).toBe(1);")
    ).toHaveLength(0);
  });

  it('ignores a different function whose name ends in expect', () => {
    expect(findTwoArgExpects("softExpect(value, 'msg');")).toHaveLength(0);
    expect(findTwoArgExpects("this.expect(value, 'msg');")).toHaveLength(0);
  });

  it('finds every occurrence, not just the first', () => {
    const src = [
      "expect(a, 'one').toBe(1);",
      'expect(b).toBe(2);',
      "expect(c, 'two').toBe(3);"
    ].join('\n');
    expect(findTwoArgExpects(src).map((h) => h.line)).toEqual([1, 3]);
  });
});

// ---------------------------------------------------------------------------
// §2 — the repo sweep (main suites AND the quarantined lane)
// ---------------------------------------------------------------------------

/** Every file that runs under JEST — main suites plus the explore lane. */
const jestContextFiles = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'coverage')
          continue;
        walk(full);
      } else if (/\.test\.tsx?$/.test(e.name)) {
        out.push(full);
      }
    }
  };
  // Every workspace EXCEPT axoview-e2e, whose specs are Playwright's and where
  // the two-argument form is legal.
  ['axoview-lib', 'axoview-app', 'axoview-backend', 'axoview-worker'].forEach(
    (pkg) => walk(path.join(REPO, 'packages', pkg, 'src'))
  );
  return out;
};

describe('class gate §2 — no Jest-context test uses the two-argument form', () => {
  const files = jestContextFiles();

  it('CONTROL: the sweep actually found the test files', () => {
    // A path typo would make this whole gate vacuously green.
    expect(files.length).toBeGreaterThan(150);
    expect(files.every((f) => !f.includes('axoview-e2e'))).toBe(true);
  });

  it('CONTROL: any campaign lane present is scanned as DATA, and is reachable', () => {
    // Between campaigns there is no lane (ADR 0047, 2026-08-10) — the sweep
    // walks all of `src`, so it covers an `__explore__` tree whenever a
    // campaign recreates one, without requiring one to exist now. When one is
    // present, reading it must not require it to compile or run.
    const lane = files.filter((f) => f.includes('__explore__'));
    for (const file of lane) {
      expect(() => fs.readFileSync(file, 'utf8')).not.toThrow();
    }
  });

  it('no file passes a message as a second argument to expect', () => {
    const offenders = files.flatMap((file) => {
      const hits = findTwoArgExpects(fs.readFileSync(file, 'utf8'));
      return hits.map(
        (h) => `${path.relative(REPO, file)}:${h.line} — Jest rejects this`
      );
    });
    expect(offenders).toEqual([]);
  });
});
