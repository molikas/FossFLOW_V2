import { useTranslation } from 'react-i18next';

interface Props {
  onExport: () => void;
  onClose: () => void;
}

export function ExportDialog({ onExport, onClose }: Props) {
  const { t } = useTranslation('app');

  return (
    <div className="dialog-overlay">
      <div className="dialog">
        <h2>{t('dialog.export.title')}</h2>
        <div
          style={{
            backgroundColor: '#d4edda',
            border: '1px solid #c3e6cb',
            padding: '15px',
            borderRadius: '8px',
            marginBottom: '20px'
          }}
        >
          <p style={{ margin: '0 0 10px 0' }}>
            <strong>✅ {t('dialog.export.recommendedTitle')}:</strong>{' '}
            {t('dialog.export.recommendedMessage')}
          </p>
          <p style={{ margin: 0, fontSize: '14px', color: '#155724' }}>
            {t('dialog.export.noteMessage')}
          </p>
        </div>
        <div className="dialog-buttons">
          <button onClick={onExport}>{t('dialog.export.btnDownload')}</button>
          <button onClick={onClose}>{t('dialog.export.btnCancel')}</button>
        </div>
      </div>
    </div>
  );
}
