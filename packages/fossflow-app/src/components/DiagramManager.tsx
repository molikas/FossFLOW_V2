import React, { useState, useEffect } from 'react';
import { DiagramInfo, StorageService } from '../services/storageService';
import './DiagramManager.css';

interface Props {
  storage: StorageService;
  isServerStorage: boolean;
  onLoadDiagram: (id: string, data: any) => void;
  onClose: () => void;
}

export const DiagramManager: React.FC<Props> = ({
  storage,
  isServerStorage,
  onLoadDiagram,
  onClose
}) => {
  const [diagrams, setDiagrams] = useState<DiagramInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadDiagrams();
  }, []);

  const loadDiagrams = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await storage.listDiagrams();
      setDiagrams(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load diagrams');
    } finally {
      setLoading(false);
    }
  };

  const handleLoad = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await storage.loadDiagram(id);
      onLoadDiagram(id, data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load diagram');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await storage.deleteDiagram(id);
      await loadDiagrams();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete diagram');
    }
  };

  const handleShare = (id: string) => {
    const url = `${window.location.origin}/display/${id}`;
    navigator.clipboard.writeText(url).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="diagram-manager-overlay">
      <div className="diagram-manager">
        <div className="diagram-manager-header">
          <h2>Open Diagram</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="storage-info">
          <span className={`storage-badge ${isServerStorage ? 'server' : 'local'}`}>
            {isServerStorage ? '🌐 Server Storage' : '💾 Local Storage'}
          </span>
        </div>

        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="loading">Loading diagrams...</div>
        ) : (
          <div className="diagram-list">
            {diagrams.length === 0 ? (
              <div className="empty-state">
                <p>No saved diagrams</p>
                <p className="hint">Save your current diagram to get started</p>
              </div>
            ) : (
              diagrams.map((diagram) => (
                <div key={diagram.id} className="diagram-item">
                  <div className="diagram-info">
                    <h3>{diagram.name}</h3>
                    <span className="diagram-meta">
                      Last modified: {diagram.lastModified.toLocaleString()}
                      {diagram.size && ` • ${(diagram.size / 1024).toFixed(1)} KB`}
                    </span>
                  </div>
                  <div className="diagram-actions">
                    <button
                      className="action-button primary"
                      onClick={() => handleLoad(diagram.id)}
                      disabled={loading}
                    >
                      Open
                    </button>
                    {isServerStorage && (
                      <button
                        className={`action-button share${copiedId === diagram.id ? ' copied' : ''}`}
                        onClick={() => handleShare(diagram.id)}
                        title="Copy share link"
                      >
                        {copiedId === diagram.id ? '✓' : '🔗'}
                      </button>
                    )}
                    <button
                      className="action-button danger"
                      onClick={() => handleDelete(diagram.id, diagram.name)}
                      disabled={loading}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
