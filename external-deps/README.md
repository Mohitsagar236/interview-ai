# External Dependencies

This folder contains external dependencies that are bundled with the application.

## Tesseract OCR

**Purpose**: Screen capture text recognition (OCR feature)  
**Size**: ~82.5 MB  
**Version**: 5.5.0

### Contents:
- 	esseract.exe - Main executable (84 KB)
- *.dll - Required libraries (68.4 MB)
- 	essdata/eng.traineddata - English language data (3.92 MB)
- 	essdata/osd.traineddata - Orientation/script detection (10.07 MB)

### How It Works:
1. Files are bundled into the app during build process
2. App automatically configures paths at startup (electron/main.js)
3. Python backend uses bundled Tesseract via TESSERACT_CMD env var
4. No user installation required!

### Source:
Downloaded from: https://github.com/UB-Mannheim/tesseract/wiki  
Original installation: C:\Program Files\Tesseract-OCR

### Adding More Languages:
To add support for additional languages:
1. Download language data from: https://github.com/tesseract-ocr/tessdata
2. Copy .traineddata files to 	essdata/ folder
3. Rebuild app with 
pm run build:prod

### License:
Tesseract OCR is licensed under Apache License 2.0
