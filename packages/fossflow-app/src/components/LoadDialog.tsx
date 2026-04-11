import { useTranslation } from 'react-i18next';

interface SavedDiagram {
  id: string;
  name: string;
  data: any;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  diagrams: SavedDiagram[];
  onLoad: (diagram: SavedDiagram) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function LoadDialog({ diagrams, onLoad, onDelete, onClose }: Props) {
  const { t } = useTranslation('app');

  return (
    <div className="dialog-overlay">
      <div className="dialog">
        <h2>{t('dialog.load.title')}</h2>
        <div className="diagram-list">
          {diagrams.length === 0 ? (
            <p>{t('dialog.load.noSavedDiagrams')}</p>
          ) : (
            diagrams.map((diagram) => (
              <div key={diagram.id} className="diagram-item">
                <div>
                  <strong>{diagram.name}</strong>
                  <br />
                  <small>
                    {t('dialog.load.updated')}:{' '}
                    {new Date(diagram.updatedAt).toLocaleString()}
                  </small>
                </div>
                <div className="diagram-actions">
                  <button onClick={() => onLoad(diagram)}>
                    {t('dialog.load.btnLoad')}
                  </button>
                  <button onClick={() => onDelete(diagram.id)}>
                    {t('dialog.load.btnDelete')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="dialog-buttons">
          <button onClick={onClose}>{t('dialog.load.btnClose')}</button>
        </div>
      </div>
    </div>
  );
}
