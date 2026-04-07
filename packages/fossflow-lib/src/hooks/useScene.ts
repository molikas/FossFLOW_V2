// Thin composition hook: merges useSceneData (read) + useSceneActions (write).
// All existing callers of useScene() continue to work — same return shape.
//
// For read-only use cases prefer importing useSceneData directly to avoid
// subscribing to action callbacks.

import { useSceneData } from 'src/hooks/useSceneData';
import { useSceneActions } from 'src/hooks/useSceneActions';

export const useScene = () => {
  const data = useSceneData();
  const actions = useSceneActions();

  return { ...data, ...actions };
};
