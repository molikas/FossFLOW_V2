// Lightweight stand-in for the axoview lib in jest. The lib's bundled dist
// pulls in CSS, SVG and react-quill-new — none of which the unit tests need.
//
// ADR 0003 addendum (2026-08-01): the lean-save functions are NOT stubbed here.
// They used to be `(model) => model`, i.e. a THIRD implementation of the rule
// that F5/ICON-01/02 was filed about — and the one the app's own tests actually
// ran against, so every assertion about stripping passed no matter what the
// real algorithm did. The dual-implementation class gate caught it on its first
// run, through the CONTROL case that checks a pure duplicate is really dropped.
//
// Re-exported from the lib SOURCE, not from `dist`: `leanSave.ts` imports only
// types (elided at compile time), so this pulls in no CSS, no SVG and no Quill,
// and it needs no build step to be current.
export {
  stripDefaultIcons,
  mergeBundledFixtures
} from '../axoview-lib/src/utils/leanSave';

// E2/RED-08, same rule and the same reason: `leanIfModel` calls it, so stubbing
// it would put the app's tests back to asserting against a stand-in. Its only
// import is a type.
export { sweepOrphanModelItems } from '../axoview-lib/src/utils/sweepOrphanModelItems';

// Still a stub — it triggers a browser download, which a unit test must not do.
export const exportAsJSON = (): void => {};
