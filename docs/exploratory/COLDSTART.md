# Cold-start prompt — exploratory campaign wave

*Hand this text verbatim to a fresh session. It is stateless by design: LEDGER.md carries all campaign state, so the same prompt starts wave 1 and every wave after it.*

---

You are running one wave of the Axoview exploratory bug-hunting campaign in `c:\mytemp\axoview-minor-fix\axoview` (Windows). You have no prior context — everything you need is in the repo.

## Read first, in this order

1. `docs/exploratory/APPROACH.md` — the method. Follow it exactly; where this prompt and that doc disagree, the doc wins.
2. `docs/exploratory/LEDGER.md` — campaign state, infrastructure checklist, wave order.
3. The area file you pick (step 2 below) — read it fully, including seed seams and coverage gaps.
4. `docs/exploratory/coverage-baseline.md` — consult per hypothesis (it is ~110 KB; read sections, never the whole file).

## Branch & commits

All campaign work happens on branch `explore/campaign`. If it doesn't exist, create it from the current checkout (the campaign docs may be uncommitted — commit them first as `docs(explore): campaign design + ledger`). Commit after infra setup and after every area (mid-area commits welcome); messages must pass commitlint (conventional), e.g. `test(explore): E1 wave — 12 hypotheses, 2 bugs filed`. Never commit to `master` or `integration`; never push unless asked.

## Step 0 — infrastructure (only if boxes are unchecked in LEDGER.md → "Infrastructure status")

Build per APPROACH §7:

- `packages/axoview-e2e/playwright.explore.config.ts` — clone the main config's shape (same `webServer`, `workers: 1`, `fullyParallel: false`, chromium + `hasTouch` chromium-touch project pattern) with `testDir: './tests-exploratory'`.
- `packages/axoview-e2e/fixtures/explore.fixture.ts` — extends the app fixture with the §4 oracles: `page.on('pageerror')` + `console.error` capture that fails the probe on any uncaught error (allow-list the `__fossflow__` deprecation warning), `expectStoreInvariants(page)` reading `window.__axoview__` (ui/model/scene store APIs), and a schema oracle (exported model must `modelSchema.safeParse` clean).
- `packages/axoview-lib/jest.explore.config.js` extending `jest.config.js` with `testMatch: ['**/__explore__/**/*.explore.test.{ts,tsx}']`, the `__explore__` ignore removed, and **no coverage thresholds**; add `'/__explore__/'` to `testPathIgnorePatterns` in `packages/axoview-lib/jest.config.js` — this line and the root `package.json` scripts `explore:unit` / `explore:e2e` are the **only** sanctioned touches outside `docs/exploratory/` and the exploratory test trees.
- Verify quarantine: `npx jest --listTests` under the default lib config must list the same files as before your change; the main Playwright config must not pick up `tests-exploratory/`.
- Tick the LEDGER checkboxes, write one trivial passing probe per harness to prove the rigs run, commit.

## Step 1 — pick an area

Take the area marked `IN PROGRESS` if one exists, else the first `OPEN` area in LEDGER wave order. Mark it `IN PROGRESS` in LEDGER.md immediately.

## Step 2 — the wave loop (APPROACH §1, summarized — the doc is normative)

- Read the code in the area's scope. Then write hypotheses into the area file's table as `PROPOSED` **before** probing — aim for ~15 to end with ≥10 counted. Use the §5 generators plus the file's seed seams/invariants/gaps. Each hypothesis must predict a *specific* wrong outcome, not "X works".
- **Novelty-check each one**: coverage-baseline sections for the area, then grep `packages/axoview-e2e/tests/` and `**/__tests__/`. Record the 1–3 nearest existing tests and why they miss it. Covered already → `DUPLICATE`, doesn't count.
- **Probe** at the cheapest tier that can falsify (§3). Anything involving hit-testing, pointer capture, or gestures must use real input (`page.mouse` / CDP touch), not synthetic dispatch. Timebox ~45 min per probe → `DEFERRED` with reason.
- **Verdict and record after every hypothesis** — update the area file row AND the LEDGER row before starting the next one. Sessions die; unrecorded work is lost work.
- `BUG` → entry in `known_issues.md` (its existing Symptom/Root cause/Workaround/Status format, tagged `**Found by:** exploratory campaign <ID>`) after checking it isn't already registered; keep the repro as a `test.fail()` probe. **Do not fix bugs** (narrow exception in §1). `SUSPECT` → the area file's product-questions list.

## Hard rules

- Never modify product code under `packages/*/src`, existing tests, existing configs (beyond the Step 0 sanctioned touches), or CI workflows. If a probe seems to require a product change, record `DEFERRED` and say so in your report.
- The default suites must stay green and untouched: exploratory code lives only in `tests-exploratory/`, `__explore__/`, and `docs/exploratory/`.
- Performance is out of scope. Known issues (`Status: Open` in known_issues.md) are not new findings.
- Don't inflate counts: a hypothesis counts only with verdict `BUG`, `SUSPECT`, or `FALSIFIED` backed by an actual executed probe.

## Environment notes

- E2E runs against the rsbuild dev server on `:3000` (Playwright `webServer` auto-starts it; kill stray port-3000 listeners if startup hangs). `workers` must stay 1 — the dev server cannot take parallel HMR clients.
- The `window.__axoview__` debug bridge exists only in dev builds — never test against a production build.
- Run probes with `npm run explore:unit` / `npm run explore:e2e` (a single spec: `npx playwright test --config packages/axoview-e2e/playwright.explore.config.ts tests-exploratory/<area>/<file>` from the repo root).

## Definition of done & handoff

- **Area done:** ≥10 counted hypotheses, every proposed row resolved or `DEFERRED` with reason, new cross-store invariants folded into `expectStoreInvariants`, LEDGER row updated to `DONE`, committed. Then continue with the next area or stop cleanly.
- **Session end (even mid-area):** area file + LEDGER reflect every verdict taken, work is committed, and the area file carries a one-line `**Next:**` note for the successor session.
- **Report back:** bugs found (ID, one-line symptom, known_issues anchor), suspects raised, counted/proposed tally per area touched, and anything DEFERRED that needs a human (live OAuth, product decisions).
