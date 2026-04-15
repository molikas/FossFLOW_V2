import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Configuration from environment variables
const STORAGE_ENABLED = process.env.ENABLE_SERVER_STORAGE === 'true';
const STORAGE_PATH = process.env.STORAGE_PATH || '/data/diagrams';
const ENABLE_GIT_BACKUP = process.env.ENABLE_GIT_BACKUP === 'true';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check / Storage status endpoint
app.get('/api/storage/status', (req, res) => {
  res.json({
    enabled: STORAGE_ENABLED,
    gitBackup: ENABLE_GIT_BACKUP,
    version: '1.0.0'
  });
});

// Only enable storage endpoints if storage is enabled
if (STORAGE_ENABLED) {
  // Ensure storage directory exists
  async function ensureStorageDir() {
    try {
      await fs.access(STORAGE_PATH);
      console.log(`Storage directory exists: ${STORAGE_PATH}`);

      // Log current files
      const files = await fs.readdir(STORAGE_PATH);
      console.log(`Current files in storage: ${files.length} files`);
      if (files.length > 0) {
        console.log('Files:', files.join(', '));
      }
    } catch {
      console.log(`Creating storage directory: ${STORAGE_PATH}`);
      await fs.mkdir(STORAGE_PATH, { recursive: true });
      console.log(`Created storage directory: ${STORAGE_PATH}`);
    }
  }

  // Initialize storage
  ensureStorageDir().catch((err) => {
    console.error('Failed to initialize storage:', err);
  });

  // List all diagrams
  app.get('/api/diagrams', async (req, res) => {
    try {
      // First check if storage directory exists
      try {
        await fs.access(STORAGE_PATH);
      } catch (err) {
        console.error(`Storage directory does not exist: ${STORAGE_PATH}`);
        return res.json([]); // Return empty array if directory doesn't exist
      }

      const files = await fs.readdir(STORAGE_PATH);
      console.log(`Found ${files.length} files in ${STORAGE_PATH}:`, files);
      const diagrams = [];

      for (const file of files) {
        if (file.endsWith('.json') && file !== 'metadata.json') {
          try {
            const filePath = path.join(STORAGE_PATH, file);
            const stats = await fs.stat(filePath);
            const content = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(content);

            // Extract name from various possible locations
            const name = data.name || data.title || 'Untitled Diagram';

            console.log(`Successfully read diagram: ${file} (name: ${name})`);

            diagrams.push({
              id: file.replace('.json', ''),
              name: name,
              lastModified: data.lastModified || stats.mtime.toISOString(),
              folderId: data.folderId ?? null,
              deletedAt: data.deletedAt ?? null
            });
          } catch (fileError) {
            console.error(`Error reading diagram file ${file}:`, fileError.message);
            // Skip this file and continue with others
            continue;
          }
        }
      }

      console.log(`Returning ${diagrams.length} diagrams`);
      res.json(diagrams);
    } catch (error) {
      console.error('Error listing diagrams:', error);
      res.status(500).json({ error: 'Failed to list diagrams', details: error.message });
    }
  });

  // Get specific diagram
  app.get('/api/diagrams/:id', async (req, res) => {
    const diagramId = req.params.id;
    console.log(`[GET /api/diagrams/${diagramId}] Loading diagram...`);

    try {
      const filePath = path.join(STORAGE_PATH, `${diagramId}.json`);
      console.log(`[GET /api/diagrams/${diagramId}] Reading from: ${filePath}`);

      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      console.log(`[GET /api/diagrams/${diagramId}] Successfully loaded, size: ${content.length} bytes, items: ${data.items?.length || 0}`);
      res.json(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.error(`[GET /api/diagrams/${diagramId}] Diagram not found`);
        res.status(404).json({ error: 'Diagram not found' });
      } else {
        console.error(`[GET /api/diagrams/${diagramId}] Error reading diagram:`, error);
        res.status(500).json({ error: 'Failed to read diagram' });
      }
    }
  });

  // Save or update diagram
  app.put('/api/diagrams/:id', async (req, res) => {
    const diagramId = req.params.id;
    console.log(`[PUT /api/diagrams/${diagramId}] Saving diagram...`);

    try {
      const filePath = path.join(STORAGE_PATH, `${diagramId}.json`);
      const data = {
        ...req.body,
        id: diagramId,
        lastModified: new Date().toISOString()
      };

      const iconCount = data.icons?.length || 0;
      const importedIconCount = (data.icons || []).filter(icon => icon.collection === 'imported').length;
      console.log(`[PUT /api/diagrams/${diagramId}] Writing to: ${filePath}`);
      console.log(`[PUT /api/diagrams/${diagramId}]   Items: ${data.items?.length || 0}, Icons: ${iconCount} (${importedIconCount} imported)`);

      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      console.log(`[PUT /api/diagrams/${diagramId}] Successfully saved`);

      // Git backup if enabled
      if (ENABLE_GIT_BACKUP) {
        // TODO: Implement git commit
        console.log('[PUT] Git backup not yet implemented');
      }

      res.json({ success: true, id: diagramId });
    } catch (error) {
      console.error(`[PUT /api/diagrams/${diagramId}] Error saving diagram:`, error);
      res.status(500).json({ error: 'Failed to save diagram' });
    }
  });

  // Delete diagram
  app.delete('/api/diagrams/:id', async (req, res) => {
    try {
      const filePath = path.join(STORAGE_PATH, `${req.params.id}.json`);
      await fs.unlink(filePath);
      
      res.json({ success: true });
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.status(404).json({ error: 'Diagram not found' });
      } else {
        console.error('Error deleting diagram:', error);
        res.status(500).json({ error: 'Failed to delete diagram' });
      }
    }
  });

  // Soft-delete or patch diagram metadata (e.g. folderId, deletedAt)
  app.patch('/api/diagrams/:id', async (req, res) => {
    const diagramId = req.params.id;
    try {
      const filePath = path.join(STORAGE_PATH, `${diagramId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      const updated = { ...data, ...req.body, id: diagramId };
      await fs.writeFile(filePath, JSON.stringify(updated, null, 2));
      res.json({ success: true });
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.status(404).json({ error: 'Diagram not found' });
      } else {
        res.status(500).json({ error: 'Failed to patch diagram' });
      }
    }
  });

  // Move diagram to a folder
  app.patch('/api/diagrams/:id/move', async (req, res) => {
    const diagramId = req.params.id;
    const { targetFolderId } = req.body;
    try {
      const filePath = path.join(STORAGE_PATH, `${diagramId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      data.folderId = targetFolderId ?? null;
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      res.json({ success: true });
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.status(404).json({ error: 'Diagram not found' });
      } else {
        res.status(500).json({ error: 'Failed to move diagram' });
      }
    }
  });

  // ---- Folder endpoints -------------------------------------------------------

  const FOLDERS_FILE = path.join(STORAGE_PATH, 'folders.json');

  async function readFolders() {
    try {
      const content = await fs.readFile(FOLDERS_FILE, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  async function writeFolders(folders) {
    await fs.writeFile(FOLDERS_FILE, JSON.stringify(folders, null, 2));
  }

  // List folders (optionally filtered by parentId)
  app.get('/api/folders', async (req, res) => {
    try {
      const all = await readFolders();
      const { parentId } = req.query;
      const result =
        parentId !== undefined
          ? all.filter((f) => String(f.parentId) === String(parentId))
          : all;
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to list folders' });
    }
  });

  // Create folder
  app.post('/api/folders', async (req, res) => {
    try {
      const { name, parentId } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      const folders = await readFolders();
      const id = `folder_${Date.now()}`;
      folders.push({ id, name, parentId: parentId ?? null });
      await writeFolders(folders);
      res.status(201).json({ success: true, id });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create folder' });
    }
  });

  // Rename folder
  app.put('/api/folders/:id', async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      const folders = await readFolders();
      const idx = folders.findIndex((f) => f.id === req.params.id);
      if (idx < 0) return res.status(404).json({ error: 'Folder not found' });
      folders[idx] = { ...folders[idx], name };
      await writeFolders(folders);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to rename folder' });
    }
  });

  // Delete folder (recursive removes children too)
  app.delete('/api/folders/:id', async (req, res) => {
    try {
      const recursive = req.query.recursive === 'true';
      let folders = await readFolders();
      if (recursive) {
        const toDelete = new Set();
        const collect = (fid) => {
          toDelete.add(fid);
          folders.filter((f) => f.parentId === fid).forEach((f) => collect(f.id));
        };
        collect(req.params.id);
        folders = folders.filter((f) => !toDelete.has(f.id));
      } else {
        const idx = folders.findIndex((f) => f.id === req.params.id);
        if (idx < 0) return res.status(404).json({ error: 'Folder not found' });
        folders.splice(idx, 1);
      }
      await writeFolders(folders);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete folder' });
    }
  });

  // Move folder to new parent
  app.patch('/api/folders/:id/move', async (req, res) => {
    try {
      const { targetFolderId } = req.body;
      const folders = await readFolders();
      const idx = folders.findIndex((f) => f.id === req.params.id);
      if (idx < 0) return res.status(404).json({ error: 'Folder not found' });
      folders[idx] = { ...folders[idx], parentId: targetFolderId ?? null };
      await writeFolders(folders);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to move folder' });
    }
  });

  // ---- Tree manifest ----------------------------------------------------------

  const MANIFEST_FILE = path.join(STORAGE_PATH, 'tree-manifest.json');

  app.get('/api/tree-manifest', async (req, res) => {
    try {
      const content = await fs.readFile(MANIFEST_FILE, 'utf-8');
      res.json(JSON.parse(content));
    } catch {
      res.json({ folders: [] });
    }
  });

  app.put('/api/tree-manifest', async (req, res) => {
    try {
      await fs.writeFile(MANIFEST_FILE, JSON.stringify(req.body, null, 2));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save tree manifest' });
    }
  });

  // ---- Diagram list: include folderId + deletedAt in response -----------------
  // (The existing GET /api/diagrams already reads these from the JSON file
  //  since we store them there on create/patch. No further changes needed.)

  // Create a new diagram
  app.post('/api/diagrams', async (req, res) => {
    try {
      const id = req.body.id || `diagram_${Date.now()}`;
      const filePath = path.join(STORAGE_PATH, `${id}.json`);
      
      // Check if already exists
      try {
        await fs.access(filePath);
        return res.status(409).json({ error: 'Diagram already exists' });
      } catch {
        // File doesn't exist, proceed
      }
      
      const data = {
        ...req.body,
        id,
        created: new Date().toISOString(),
        lastModified: new Date().toISOString()
      };
      
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      res.status(201).json({ success: true, id });
    } catch (error) {
      console.error('Error creating diagram:', error);
      res.status(500).json({ error: 'Failed to create diagram' });
    }
  });

} else {
  // Storage disabled - return appropriate responses
  app.get('/api/diagrams', (req, res) => {
    res.status(503).json({ error: 'Server storage is disabled' });
  });
  
  app.get('/api/diagrams/:id', (req, res) => {
    res.status(503).json({ error: 'Server storage is disabled' });
  });
  
  app.put('/api/diagrams/:id', (req, res) => {
    res.status(503).json({ error: 'Server storage is disabled' });
  });
  
  app.delete('/api/diagrams/:id', (req, res) => {
    res.status(503).json({ error: 'Server storage is disabled' });
  });
  
  app.post('/api/diagrams', (req, res) => {
    res.status(503).json({ error: 'Server storage is disabled' });
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`FossFLOW Backend Server running on port ${PORT}`);
  console.log(`Server storage: ${STORAGE_ENABLED ? 'ENABLED' : 'DISABLED'}`);
  if (STORAGE_ENABLED) {
    console.log(`Storage path: ${STORAGE_PATH}`);
    console.log(`Git backup: ${ENABLE_GIT_BACKUP ? 'ENABLED' : 'DISABLED'}`);
  }
});