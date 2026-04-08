import React, { memo, useMemo } from 'react';
import { useScene } from 'src/hooks/useScene';
import { useLayerContext } from 'src/hooks/useLayerContext';
import { TextBox } from './TextBox';

interface Props {
  textBoxes: ReturnType<typeof useScene>['textBoxes'];
}

export const TextBoxes = memo(({ textBoxes }: Props) => {
  const { visibleIds } = useLayerContext();

  const visibleTextBoxes = useMemo(() => {
    const filtered = textBoxes.filter(
      (t) => visibleIds.size === 0 || visibleIds.has(t.id)
    );
    return [...filtered].reverse();
  }, [textBoxes, visibleIds]);

  return (
    <>
      {visibleTextBoxes.map((textBox) => (
        <TextBox key={textBox.id} textBox={textBox} />
      ))}
    </>
  );
});
