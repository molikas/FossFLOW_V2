import React, { useState, useEffect } from 'react';
import { Box, FormControlLabel, Switch } from '@mui/material';
import { useScene } from 'src/hooks/useScene';
import { useTranslation } from 'src/stores/localeStore';
import { ColorSwatch } from 'src/components/ColorSelector/ColorSwatch';
import { CustomColorInput } from 'src/components/ColorSelector/CustomColorInput';

interface Props {
  value: string | undefined;
  onChange: (color: string | undefined) => void;
}

const BLACK = '#000000';

const isPresetColor = (hex: string | undefined, presetHexValues: string[]) => {
  if (!hex || hex.toLowerCase() === BLACK) return true;
  return presetHexValues.some((v) => v.toLowerCase() === hex.toLowerCase());
};

export const LabelColorPicker = ({ value, onChange }: Props) => {
  const { t } = useTranslation('labelColorPicker');
  const { colors } = useScene();

  const presetHexValues = colors.map((c) => c.value);
  const [useCustom, setUseCustom] = useState(
    !isPresetColor(value, presetHexValues)
  );

  // Sync to custom mode if value changes externally to a non-preset colour
  // (e.g. loading a diagram that already has a custom label colour).
  // Only transitions TO custom — never resets a user's explicit toggle back to presets.
  useEffect(() => {
    if (!isPresetColor(value, presetHexValues)) {
      setUseCustom(true);
    }
  }, [value]); // presetHexValues intentionally omitted: palette changes are rare and non-breaking

  const activeHex = value || BLACK;
  // Deduplicate: exclude any scene color that is already black
  const sceneColors = colors.filter((c) => c.value.toLowerCase() !== BLACK);

  return (
    <Box>
      <FormControlLabel
        control={
          <Switch
            checked={useCustom}
            onChange={(e) => {
              setUseCustom(e.target.checked);
              if (e.target.checked) {
                // Switching to custom — seed with current value (default black)
                if (!value) onChange(BLACK);
              } else {
                // Switching back to presets — reset to default (black)
                onChange(undefined);
              }
            }}
          />
        }
        label={t('customColor')}
        sx={{ mb: 1 }}
      />
      {useCustom ? (
        <CustomColorInput
          value={activeHex}
          onChange={(hex) => onChange(hex === BLACK ? undefined : hex)}
        />
      ) : (
        <Box>
          {/* Black (default) */}
          <ColorSwatch
            hex={BLACK}
            isActive={!value || value.toLowerCase() === BLACK}
            onClick={() => onChange(undefined)}
          />
          {/* Scene colour presets */}
          {sceneColors.map((color) => (
            <ColorSwatch
              key={color.id}
              hex={color.value}
              isActive={activeHex.toLowerCase() === color.value.toLowerCase()}
              onClick={() => onChange(color.value)}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};
