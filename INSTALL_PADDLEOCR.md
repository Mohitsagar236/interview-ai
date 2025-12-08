# Install PaddleOCR for Superior OCR Accuracy

## Why PaddleOCR?

PaddleOCR is **significantly better** than Tesseract for:
- ✅ Screenshots and screen captures
- ✅ Code snippets and technical text  
- ✅ Low contrast or small text
- ✅ Rotated or angled text
- ✅ Mixed languages
- ✅ Complex layouts

**Performance:** 2-3x better accuracy than Tesseract on interview coding problems!

## Installation

### Step 1: Install PaddleOCR

Open PowerShell in the project directory and activate your virtual environment:

```powershell
# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Install PaddleOCR
pip install paddleocr
```

### Step 2: Install Dependencies

PaddleOCR requires some additional packages:

```powershell
pip install paddlepaddle -i https://mirror.baidu.com/pypi/simple
```

**For CPU only** (recommended for most users):
```powershell
pip install paddlepaddle==2.6.0 -i https://mirror.baidu.com/pypi/simple
```

**For GPU** (if you have NVIDIA GPU with CUDA):
```powershell
pip install paddlepaddle-gpu==2.6.0 -i https://mirror.baidu.com/pypi/simple
```

### Step 3: Verify Installation

```powershell
python -c "from paddleocr import PaddleOCR; print('✅ PaddleOCR installed successfully!')"
```

## Configuration

The app automatically uses PaddleOCR if installed. You can control it via `.env`:

```bash
# Enable/disable PaddleOCR (default: enabled)
USE_PADDLEOCR=1

# If PaddleOCR fails, it automatically falls back to Tesseract
```

## Comparison: PaddleOCR vs Tesseract

| Feature | PaddleOCR | Tesseract |
|---------|-----------|-----------|
| Screenshot accuracy | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| Code detection | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| Low contrast | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| Small text | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| Speed | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Installation | Medium | Easy |

## Troubleshooting

### Error: "No module named 'paddle'"

Install PaddlePaddle:
```powershell
pip install paddlepaddle -i https://mirror.baidu.com/pypi/simple
```

### Error: "shapely" or "pyclipper" not found

Install missing dependencies:
```powershell
pip install shapely pyclipper
```

### Models downloading on first run

On first use, PaddleOCR downloads models (~100MB). This happens once:
- Detection model (~8MB)
- Recognition model (~50MB)  
- Angle classifier (~1MB)

Models are cached in: `%USERPROFILE%\.paddleocr/`

### Memory issues

If you encounter memory errors, edit `paddleocr_engine.py`:
```python
cpu_threads=2,  # Reduce from 4 to 2
```

## Testing PaddleOCR

After installation, capture a screenshot with code or text and the app will automatically use PaddleOCR. Check the logs:

```
[INFO] Using PaddleOCR engine (superior accuracy)
[INFO] ✅ PaddleOCR successful: 1234 characters
```

If PaddleOCR isn't working, it will fall back to Tesseract automatically.

## Alternative: Keep Using Tesseract

If you prefer to keep using Tesseract, set in `.env`:

```bash
USE_PADDLEOCR=0
```

This will skip PaddleOCR and use only Tesseract.
