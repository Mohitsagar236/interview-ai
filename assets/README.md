# Application Icons

The current production release targets Windows x64.

Required assets:

- `icon.ico` - Windows installer, desktop shortcut, taskbar, and tray icon.
- `icon.png` - high-resolution PNG used by website/build tooling when needed.
- `icon.svg` - source vector used to regenerate icons.
- `icon-*.png` - reference PNG sizes generated from the SVG.

Regenerate icons after editing `icon.svg`:

```powershell
npm run generate-icons
```

The production installer uses `assets/icon.ico` through `electron-builder-prod.json`.
