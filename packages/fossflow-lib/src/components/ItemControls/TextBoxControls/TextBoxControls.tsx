import React from 'react';
import { ProjectionOrientationEnum } from 'src/types';
import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Slider,
  IconButton as MUIIconButton
} from '@mui/material';
import {
  TextRotationNone as TextRotationNoneIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { useTextBox } from 'src/hooks/useTextBox';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { getIsoProjectionCss } from 'src/utils';
import { useScene } from 'src/hooks/useScene';
import { RichTextEditor } from 'src/components/RichTextEditor/RichTextEditor';
import { ControlsContainer } from '../components/ControlsContainer';
import { Section } from '../components/Section';
import { DeleteButton } from '../components/DeleteButton';
import { LabelColorPicker } from '../components/LabelColorPicker';
import { useTranslation } from 'src/stores/localeStore';

interface Props {
  id: string;
}

export const TextBoxControls = ({ id }: Props) => {
  const { t } = useTranslation('textBoxControls');
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const textBox = useTextBox(id);
  const { updateTextBox, deleteTextBox } = useScene();

  // If textBox doesn't exist, return null
  if (!textBox) {
    return null;
  }

  return (
    <ControlsContainer>
      <Box sx={{ position: 'relative', paddingTop: '24px' }}>
        {/* Close button */}
        <MUIIconButton
          aria-label={t('close')}
          onClick={() => {
            return uiStateActions.setItemControls(null);
          }}
          sx={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 2
          }}
          size="small"
        >
          <CloseIcon />
        </MUIIconButton>
        <Section title={t('text')}>
          <RichTextEditor
            value={textBox.content}
            onChange={(html) => {
              updateTextBox(textBox.id, { content: html });
            }}
            height={120}
          />
        </Section>
        <Section title={t('textSize')}>
          <Slider
            marks
            step={0.15}
            min={0.3}
            max={0.9}
            value={textBox.fontSize}
            onChange={(e, newSize) => {
              updateTextBox(textBox.id, { fontSize: newSize as number });
            }}
          />
        </Section>
        <Section title={t('textColor')}>
          <LabelColorPicker
            value={textBox.color}
            onChange={(color) => updateTextBox(textBox.id, { color })}
          />
        </Section>
        <Section title={t('alignment')}>
          <ToggleButtonGroup
            value={textBox.orientation}
            exclusive
            onChange={(e, orientation) => {
              if (textBox.orientation === orientation || orientation === null)
                return;

              updateTextBox(textBox.id, { orientation });
            }}
          >
            <ToggleButton value={ProjectionOrientationEnum.X}>
              <TextRotationNoneIcon sx={{ transform: getIsoProjectionCss() }} />
            </ToggleButton>
            <ToggleButton value={ProjectionOrientationEnum.Y}>
              <TextRotationNoneIcon
                sx={{
                  transform: `scale(-1, 1) ${getIsoProjectionCss()} scale(-1, 1)`
                }}
              />
            </ToggleButton>
          </ToggleButtonGroup>
        </Section>
        <Section>
          <Box>
            <DeleteButton
              onClick={() => {
                uiStateActions.setItemControls(null);
                deleteTextBox(textBox.id);
              }}
            />
          </Box>
        </Section>
      </Box>
    </ControlsContainer>
  );
};
