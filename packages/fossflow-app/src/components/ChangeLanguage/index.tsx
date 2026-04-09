import { useTranslation } from 'react-i18next';
import { Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import { supportedLanguages } from '../../i18n';

const ChangeLanguage = () => {
  const { i18n } = useTranslation();

  const handleChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('i18nextLng', lang);
  };

  return (
    <FormControl size="small" sx={{ minWidth: 160 }}>
      <InputLabel id="language-select-label">Language</InputLabel>
      <Select
        labelId="language-select-label"
        value={i18n.language || 'en-US'}
        label="Language"
        onChange={(e) => handleChange(e.target.value)}
      >
        {supportedLanguages.map((lang) => (
          <MenuItem key={lang.value} value={lang.value}>
            {lang.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

export default ChangeLanguage;
