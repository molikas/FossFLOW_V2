# FossFLOW - Isometric Diagramming Tool

FossFLOW is a powerful, open-source Progressive Web App (PWA) for creating beautiful isometric diagrams. Built with React and the Isoflow (Now forked and published to NPM as fossflow) library, it runs entirely in your browser with offline support.

![Screenshot_20250630_160954](https://github.com/user-attachments/assets/e7f254ad-625f-4b8a-8efc-5293b5be9d55)



- **🤝 [CONTRIBUTORS.md](https://github.com/stan-smith/fossflow-lib/blob/main/CONTRIBUTORS.md)** - How to contribute to the project.


## Features

- 🎨 **Isometric Diagramming** - Create stunning 3D-style technical diagrams
- 💾 **Auto-Save** - Your work is automatically saved every 5 seconds
- 📱 **PWA Support** - Install as a native app on Mac and Linux
- 🔒 **Privacy-First** - All data stored locally in your browser
- 📤 **Import/Export** - Share diagrams as JSON files
- 🎯 **Session Storage** - Quick save without dialogs
- 🌐 **Offline Support** - Work without internet connection
- 📋 **Copy/Paste** - Copy and paste nodes, connectors, rectangles, and text boxes with `Ctrl+C` / `Ctrl+V`
- 🔲 **Lasso Select** - Draw a selection box to select and move multiple items at once


## What This Fork Adds

This fork extends the original Isoflow project with new features and fixes that improve the day-to-day diagramming experience. Here is what you get:

### Editing improvements

- **Copy and paste** — Select any combination of nodes, connectors, rectangles, and text boxes, then paste them anywhere on the canvas with `Ctrl+C` / `Ctrl+V`. Pasted items appear centered around your mouse cursor. Connectors between pasted nodes are included automatically, complete with their waypoints.
- **Freehand lasso selection** — In addition to the rectangular lasso, you can draw a freehand polygon to select exactly the items you want, even in a crowded diagram.
- **Dragging feels right** — Dragging nodes, text boxes, and rectangles now responds the instant you move, tracks your grab point precisely, and stops at the last valid position when blocked by another element rather than jumping around. The blue highlight tile always stays in sync with the cursor while dragging.
- **Undo/redo** — Full multi-step undo and redo for all canvas changes.
- **Multi-view diagrams** — Create multiple named views (tabs) within a single file. Each view is an independent canvas.

### Navigation and canvas

- **Right-click to pan** — Hold right-click and drag to pan the canvas. Release to go back to what you were doing. No need to switch to a pan tool.
- **Sensible default zoom** — The canvas opens at 90% zoom so you immediately have some room to work with.
- **Context menu** — Right-click on an empty area of the canvas to quickly add a node or rectangle without reaching for the toolbar.

### Quality-of-life fixes

- **Clicking a node to edit it no longer adds an empty description block** to the node's label on the canvas.
- **Language dropdown opens on click**, not on hover — it no longer pops open accidentally when you move the mouse past it.
- **Lasso selection tip** auto-dismisses after you use it once, so it does not get in the way every session.
- **Help dialog** (`F1` or `?`) documents all keyboard shortcuts including copy/paste.

---

## Changelog

### 2026-03-24

- **Node drag: absolute positioning** — Nodes, text boxes, and rectangles now move relative to the exact grab point rather than frame-by-frame delta, eliminating the drift and desync that occurred when holding a node still briefly during a drag.
- **Drag activation: instant** — Drag now activates the moment the cursor moves to an adjacent tile. Previously there was a half-cell delay caused by a stale delta value (one animation frame behind). Affects nodes, text boxes, and rectangles.
- **Node collision: stay-at-last-valid** — When a dragged node would overlap another node, it now stays at the last valid position instead of jumping to the nearest free tile. This makes dragging past occupied cells feel natural.
- **Drag cursor highlight: always visible** — The blue tile highlight (cursor) now tracks the mouse correctly throughout a drag. Previously the highlight was hidden for nodes to mask a desync; with absolute positioning the desync is gone.
- **Not-allowed cursor: nodes only** — The `not-allowed` cursor now only appears when a node is dragged onto another node. It no longer shows incorrectly when moving text boxes or rectangles.
- **Connector copy-paste: waypoints move with the connector** — Intermediate tile waypoints in a connector path are now correctly offset when pasting. Previously they stayed at their original coordinates.
- **Language selector: click to expand** — The language dropdown in the settings area now opens and closes on click only, instead of expanding on hover.

### Previous

- **Copy/Paste** (`Ctrl+C` / `Ctrl+V`): Copy and paste any selection of nodes, connectors, rectangles, and text boxes. Pastes at mouse position with collision avoidance, full ID remapping, and a single undo step.
- **Lasso hint auto-dismiss**: The lasso selection tip tooltip now automatically dismisses after the first time you use lasso mode, rather than requiring a manual close every session.
- **Node label fix**: Clicking a node to edit it no longer incorrectly adds an empty description block to the node's canvas label.
- **Help dialog & hotkey settings**: Copy/paste shortcuts documented in the Help dialog (`?`) and Settings → Hotkeys panel.


## Try it online

Go to https://stan-smith.github.io/FossFLOW/


## Quick start on local environment

```bash
# Clone the repository
git clone https://github.com/stan-smith/FossFLOW
cd FossFLOW

# Make sure you have npm installed

# Install dependencies
npm install

# Start development server
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How to Use





### Creating Diagrams

1. **Add Items**:
  - Press the "+" button on the top right menu, the library of components will appear on the left. Drag and drop components from the library onto the canvas
  - Or, perform a right click on the grid and select "Add node", you can then click on the new node you created and customise it from the left menu
2. **Connect Items**: Use connectors to show relationships between components
3. **Customize**: Change colors, labels, and properties of items
4. **Navigate**: Pan and zoom to work on different areas

### Saving Your Work

- **Auto-Save**: Diagrams are automatically saved to browser storage every 5 seconds
- **Quick Save**: Click "Quick Save (Session)" for instant saves without popups
- **Save As**: Use "Save New" to create a copy with a different name

### Managing Diagrams

- **Load**: Click "Load" to see all your saved diagrams
- **Import**: Load diagrams from JSON files shared by others
- **Export**: Download your diagrams as JSON files to share or backup
- **Storage**: Use "Storage Manager" to manage browser storage space

### Keyboard Shortcuts

- `Delete` / `Backspace` - Remove selected items
- `Ctrl+Z` - Undo
- `Ctrl+Y` / `Ctrl+Shift+Z` - Redo
- `Ctrl+C` - Copy selected item(s)
- `Ctrl+V` - Paste at mouse position
- Mouse wheel - Zoom in/out
- Click and drag (empty area) - Lasso select multiple items
- Right-click - Toggle pan mode

## Building for Production

```bash
# Create optimized production build
npm run build

# Serve the production build locally
npx serve -s build
```

The build folder contains all files needed for deployment.

If you need the app to be deployed to a custom path (i.e. not root), use instead:
```bash
# Create optimized production build for given path
PUBLIC_URL="https://mydomain.tld/path/to/app" npm run build
```
That will add the defined `PUBLIC_URL` as a prefix to all links to static files.

## Deployment

### Static Hosting

Deploy the `build` folder to any static hosting service:
- GitHub Pages
- Netlify
- Vercel
- AWS S3
- Any web server

### Important Notes

1. **HTTPS Required**: PWA features require HTTPS (except localhost)
2. **Browser Storage**: Diagrams are saved in browser localStorage (~5-10MB limit)
3. **Backup**: Regularly export important diagrams as JSON files

## Browser Support

- Chrome/Edge (Recommended) ✅
- Firefox ✅
- Safari ✅
- Mobile browsers with PWA support ✅

## Troubleshooting

### Storage Full
- Use Storage Manager to free space
- Export and delete old diagrams
- Clear browser data (last resort - will delete all diagrams)

### Can't Install PWA
- Ensure using HTTPS
- Try Chrome or Edge browsers
- Check if already installed

### Lost Diagrams
- Check browser's localStorage
- Look for auto-saved versions
- Always export important work

## Technology Stack

- **React** - UI framework
- **TypeScript** - Type safety
- **Isoflow** - Isometric diagram engine
- **PWA** - Offline-first web app

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

Isoflow is released under the MIT license.

FossFLOW is released under the Unlicense license, do what you want with it.

## Acknowledgments

Built with the [Isoflow](https://github.com/markmanx/isoflow) library.

x0z.co
