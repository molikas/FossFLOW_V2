import { useTranslation } from 'react-i18next';

interface Props {
  diagramName: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export function SaveDialog({ diagramName, onNameChange, onSave, onClose }: Props) {
  const { t } = useTranslation('app');

  return (
    <div className="dialog-overlay">
      <div className="dialog">
        <h2>{t('dialog.save.title')}</h2>
        <input
          type="text"
          placeholder={t('dialog.save.placeholder')}
          value={diagramName}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSave()}
          autoFocus
        />
        <div className="dialog-buttons">
          <button onClick={onSave}>{t('dialog.save.btnSave')}</button>
          <button onClick={onClose}>{t('dialog.save.btnCancel')}</button>
        </div>
      </div>
    </div>
  );
}
