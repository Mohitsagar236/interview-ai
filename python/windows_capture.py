"""
Windows-specific screen capture using native Windows API
This can capture restricted applications that Electron's desktopCapturer cannot access
"""
import logging
import base64
from io import BytesIO
from typing import Optional, Dict, Tuple

logger = logging.getLogger(__name__)

try:
    # Windows-specific imports
    import win32gui
    import win32ui
    import win32con
    import win32api
    from PIL import Image
    WINDOWS_CAPTURE_AVAILABLE = True
except ImportError as e:
    WINDOWS_CAPTURE_AVAILABLE = False
    logger.warning(f"Windows capture not available: {e}. Install pywin32 for restricted app capture support.")


def capture_screen_windows(monitor_index: int = 0) -> Optional[Dict]:
    """
    Capture screen using Windows GDI API - works with restricted applications
    
    Args:
        monitor_index: Which monitor to capture (0 = primary)
        
    Returns:
        Dict with keys: image (base64), width, height, format
        None if capture fails
    """
    if not WINDOWS_CAPTURE_AVAILABLE:
        logger.error("Windows capture not available - pywin32 not installed")
        return None
    
    try:
        # Get all monitors
        monitors = win32api.EnumDisplayMonitors()
        
        if not monitors:
            logger.error("No monitors found")
            return None
        
        # Select target monitor (default to primary)
        if monitor_index >= len(monitors):
            monitor_index = 0
        
        monitor = monitors[monitor_index][2]  # Monitor rect (left, top, right, bottom)
        left, top, right, bottom = monitor
        width = right - left
        height = bottom - top
        
        logger.info(f"Capturing monitor {monitor_index}: {width}x{height} at ({left},{top})")
        
        # Create device contexts
        hdesktop = win32gui.GetDesktopWindow()
        desktop_dc = win32gui.GetWindowDC(hdesktop)
        img_dc = win32ui.CreateDCFromHandle(desktop_dc)
        mem_dc = img_dc.CreateCompatibleDC()
        
        # Create bitmap object
        screenshot = win32ui.CreateBitmap()
        screenshot.CreateCompatibleBitmap(img_dc, width, height)
        mem_dc.SelectObject(screenshot)
        
        # Copy screen into bitmap
        mem_dc.BitBlt(
            (0, 0),           # Destination
            (width, height),  # Size
            img_dc,           # Source DC
            (left, top),      # Source position
            win32con.SRCCOPY  # Copy mode
        )
        
        # Convert to PIL Image
        bmpinfo = screenshot.GetInfo()
        bmpstr = screenshot.GetBitmapBits(True)
        
        img = Image.frombuffer(
            'RGB',
            (bmpinfo['bmWidth'], bmpinfo['bmHeight']),
            bmpstr,
            'raw',
            'BGRX',
            0,
            1
        )
        
        # Clean up Windows resources
        mem_dc.DeleteDC()
        win32gui.DeleteObject(screenshot.GetHandle())
        win32gui.ReleaseDC(hdesktop, desktop_dc)
        
        # Convert to base64 PNG
        buffer = BytesIO()
        img.save(buffer, format='PNG', optimize=True)
        buffer.seek(0)
        img_base64 = base64.b64encode(buffer.read()).decode('utf-8')
        
        logger.info(f"✅ Windows capture successful: {width}x{height}, {len(img_base64)} bytes")
        
        return {
            'image': img_base64,
            'width': width,
            'height': height,
            'format': 'png',
            'method': 'windows_gdi'
        }
        
    except Exception as e:
        logger.error(f"Windows capture failed: {e}", exc_info=True)
        return None


def capture_window_windows(window_title: Optional[str] = None, hwnd: Optional[int] = None) -> Optional[Dict]:
    """
    Capture a specific window using Windows API
    
    Args:
        window_title: Title of window to capture (partial match)
        hwnd: Window handle (if known)
        
    Returns:
        Dict with keys: image (base64), width, height, format, window_title
        None if capture fails
    """
    if not WINDOWS_CAPTURE_AVAILABLE:
        logger.error("Windows capture not available - pywin32 not installed")
        return None
    
    try:
        # Find window by title if hwnd not provided
        if hwnd is None:
            if window_title:
                hwnd = win32gui.FindWindow(None, window_title)
                if hwnd == 0:
                    # Try partial match
                    def callback(h, extra):
                        if window_title.lower() in win32gui.GetWindowText(h).lower():
                            extra.append(h)
                    
                    handles = []
                    win32gui.EnumWindows(callback, handles)
                    if handles:
                        hwnd = handles[0]
                    else:
                        logger.error(f"Window not found: {window_title}")
                        return None
            else:
                # Use foreground window
                hwnd = win32gui.GetForegroundWindow()
        
        # Get window rect
        left, top, right, bottom = win32gui.GetWindowRect(hwnd)
        width = right - left
        height = bottom - top
        
        window_text = win32gui.GetWindowText(hwnd)
        logger.info(f"Capturing window: '{window_text}' {width}x{height}")
        
        # Create device contexts
        hwnd_dc = win32gui.GetWindowDC(hwnd)
        mfc_dc = win32ui.CreateDCFromHandle(hwnd_dc)
        save_dc = mfc_dc.CreateCompatibleDC()
        
        # Create bitmap
        bitmap = win32ui.CreateBitmap()
        bitmap.CreateCompatibleBitmap(mfc_dc, width, height)
        save_dc.SelectObject(bitmap)
        
        # Copy window content
        # Use PrintWindow for better compatibility with some apps
        result = win32gui.PrintWindow(hwnd, save_dc.GetSafeHdc(), 3)  # PW_RENDERFULLCONTENT
        
        if result == 0:
            # Fallback to BitBlt if PrintWindow fails
            save_dc.BitBlt(
                (0, 0),
                (width, height),
                mfc_dc,
                (0, 0),
                win32con.SRCCOPY
            )
        
        # Convert to PIL Image
        bmpinfo = bitmap.GetInfo()
        bmpstr = bitmap.GetBitmapBits(True)
        
        img = Image.frombuffer(
            'RGB',
            (bmpinfo['bmWidth'], bmpinfo['bmHeight']),
            bmpstr,
            'raw',
            'BGRX',
            0,
            1
        )
        
        # Clean up
        save_dc.DeleteDC()
        mfc_dc.DeleteDC()
        win32gui.ReleaseDC(hwnd, hwnd_dc)
        win32gui.DeleteObject(bitmap.GetHandle())
        
        # Convert to base64 PNG
        buffer = BytesIO()
        img.save(buffer, format='PNG', optimize=True)
        buffer.seek(0)
        img_base64 = base64.b64encode(buffer.read()).decode('utf-8')
        
        logger.info(f"✅ Window capture successful: {width}x{height}, {len(img_base64)} bytes")
        
        return {
            'image': img_base64,
            'width': width,
            'height': height,
            'format': 'png',
            'method': 'windows_window',
            'window_title': window_text
        }
        
    except Exception as e:
        logger.error(f"Window capture failed: {e}", exc_info=True)
        return None


def get_available_windows() -> list:
    """Get list of all visible windows"""
    if not WINDOWS_CAPTURE_AVAILABLE:
        return []
    
    windows = []
    
    def callback(hwnd, extra):
        if win32gui.IsWindowVisible(hwnd):
            title = win32gui.GetWindowText(hwnd)
            if title:  # Only include windows with titles
                windows.append({
                    'hwnd': hwnd,
                    'title': title
                })
    
    try:
        win32gui.EnumWindows(callback, None)
    except Exception as e:
        logger.error(f"Failed to enumerate windows: {e}")
    
    return windows


def is_windows_capture_available() -> bool:
    """Check if Windows native capture is available"""
    return WINDOWS_CAPTURE_AVAILABLE
