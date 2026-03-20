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


## Changelog

### Latest

- **Copy/Paste** (`Ctrl+C` / `Ctrl+V`): Copy and paste any selection of nodes, connectors, rectangles, and text boxes. Pastes at mouse position with collision avoidance, full ID remapping, and a single undo step. Post-paste selection highlights all pasted items.
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
