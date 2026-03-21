import React, { memo, useMemo } from 'react';
import { useScene } from 'src/hooks/useScene';
import { TextBox } from './TextBox';

interface Props {
  textBoxes: ReturnType<typeof useScene>['textBoxes'];
}

export const TextBoxes = memo(({ textBoxes }: Props) => {
  const reversedTextBoxes = useMemo(() => [...textBoxes].reverse(), [textBoxes]);

  return (
    <>
      {reversedTextBoxes.map((textBox) => (
        <TextBox key={textBox.id} textBox={textBox} />
      ))}
    </>
  );
});
