# Performance Refactoring Regression Suite

This folder contains tests written **before** the performance refactoring described in the
architectural review (March 2026). Its sole purpose is to lock in existing correct behaviour so
that regressions introduced during the refactoring are caught immediately.

## Why a separate folder?

The tests in `src/**/__tests__/` cover unit correctness of individual functions and reducers.
These tests cover **behavioural contracts** that the performance fixes must not violate. Keeping
them separate makes the diff reviewable: a code reviewer can open this folder and immediately
understand what was tested before touching the hot paths.

## Issues covered

| File | Issue IDs | What it guards |
|------|-----------|----------------|
| `grid.backgroundFormula.test.ts` | C-1 | Grid tile background position/size formula |
| `useScene.listShape.test.tsx` | C-2 | List data shape, DEFAULTS merging, view switching |
| `useScene.referenceStability.test.tsx` | C-2 | Memoised list ref stability across unrelated updates |
| `uiOverlay.editorModes.test.ts` | C-3 | Tool set per editor mode |
| `useResizeObserver.lifecycle.test.ts` | H-2 | Observer setup, cleanup, no setState after unmount |
| `useRAFThrottle.cleanup.test.ts` | M-2 | RAF cancelled + no stale callback fires after cleanup |
| `keyboard.dispatch.test.tsx` | H-1 | Each shortcut fires its action exactly once per keydown |
| `viewOps.integration.test.tsx` | C-2 | View create / rename / delete roundtrip via useScene |

## Rules

- Do **not** modify these tests during the refactoring unless the behaviour being tested is
  intentionally being changed, and that change has been agreed in review.
- All tests in this folder must be **green on the current codebase** before any refactoring begins.
- Run with: `npm test --workspace=packages/fossflow-lib -- --testPathPattern=__perf_refactor_regression__`
