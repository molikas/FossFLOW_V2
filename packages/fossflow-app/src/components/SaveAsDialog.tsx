import { useTranslation } from 'react-i18next';

interface Props {
  name: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export function SaveAsDialog({ name, onNameChange, onSave, onClose }: Props) {
  const { t } = useTranslation('app');

  return (
    <div className="dialog-overlay">
      <div className="dialog">
        <h2>{t('dialog.saveAs.title', 'Save Diagram')}</h2>
        <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#666' }}>
          {t('dialog.saveAs.subtitle', 'Choose a name to save this diagram.')}
        </p>
        <input
          type="text"
          placeholder={t('dialog.saveAs.fileNamePlaceholder', 'File name')}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSave()}
          autoFocus
        />
        <div className="dialog-buttons">
          <button onClick={onSave}>{t('dialog.saveAs.btnSave', 'Save')}</button>
          <button onClick={onClose}>{t('dialog.saveAs.btnCancel', 'Cancel')}</button>
        </div>
      </div>
    </div>
  );
}
