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
    from PIL import Image, ImageStat
    WINDOWS_CAPTURE_AVAILABLE = True
    
    # Define missing constants if not available
    if not hasattr(win32con, 'CAPTUREBLT'):
        win32con.CAPTUREBLT = 0x40000000
    
    # Import ctypes for PrintWindow if not available
    import ctypes
    user32 = ctypes.windll.user32
    if not hasattr(win32gui, 'PrintWindow'):
        def PrintWindow(hwnd, hdc, flags):
            return user32.PrintWindow(hwnd, hdc, flags)
        win32gui.PrintWindow = PrintWindow
    
except ImportError as e:
    WINDOWS_CAPTURE_AVAILABLE = False
    logger.warning(f"Windows capture not available: {e}. Install pywin32 for restricted app capture support.")

try:
    from mss import mss
    MSS_AVAILABLE = True
except ImportError:
    MSS_AVAILABLE = False

    try:
        import dxcam
        DXCAM_AVAILABLE = True
    except ImportError:
        DXCAM_AVAILABLE = False


def _encode_image(img: "Image.Image") -> Tuple[str, int, int]:
    buffer = BytesIO()
    img.save(buffer, format='PNG', optimize=True)
    buffer.seek(0)
    img_base64 = base64.b64encode(buffer.read()).decode('utf-8')
    width, height = img.size
    return img_base64, width, height


def _is_blank_image(img: "Image.Image") -> bool:
    # Detect single-color captures that usually indicate restricted surfaces
    try:
        stats = ImageStat.Stat(img.convert('L'))
        min_gray, max_gray = stats.extrema[0]
        std_dev = stats.stddev[0]
        # Allow a small tolerance for compression noise
        return (max_gray - min_gray) <= 2 and std_dev <= 1.5
    except Exception:
        return False


def _is_browser_window(window_title: str) -> bool:
    """Check if window appears to be a web browser"""
    browser_keywords = ['chrome', 'firefox', 'edge', 'opera', 'safari', 'browser']
    title_lower = window_title.lower()
    return any(keyword in title_lower for keyword in browser_keywords)


def _is_coding_platform_window(window_title: str) -> bool:
    """Check if window appears to be a coding platform"""
    coding_keywords = ['leetcode', 'hackerrank', 'codeforces', 'geeksforgeeks', 'interviewbit', 'codility']
    title_lower = window_title.lower()
    return any(keyword in title_lower for keyword in coding_keywords)


def _is_teams_window(window_title: str) -> bool:
    """Check if window appears to be Microsoft Teams"""
    teams_keywords = ['teams', 'microsoft teams']
    title_lower = window_title.lower()
    return any(keyword in title_lower for keyword in teams_keywords)


def _is_screen_sharing_active(window_title: str) -> bool:
    """Check if window title suggests screen sharing is active"""
    sharing_keywords = ['sharing', 'share', 'presenting', 'presentation', 'screen share']
    title_lower = window_title.lower()
    return any(keyword in title_lower for keyword in sharing_keywords)


def _fallback_capture_with_mss(region: Optional[Dict[str, int]] = None, monitor_index: int = 0) -> Optional[Tuple["Image.Image", Dict[str, int]]]:
    if not MSS_AVAILABLE:
        return None
    try:
        with mss() as sct:
            if region:
                grab_region = {
                    'top': int(region['top']),
                    'left': int(region['left']),
                    'width': int(region['width']),
                    'height': int(region['height'])
                }
                shot = sct.grab(grab_region)
                method = 'mss_window'
            else:
                monitors = sct.monitors
                if not monitors:
                    return None
                # mss uses 1-based indexing for individual monitors
                m_monitor_index = monitor_index + 1
                if m_monitor_index >= len(monitors):
                    m_monitor_index = 1
                shot = sct.grab(monitors[m_monitor_index])
                method = 'mss_monitor'
            img = Image.frombytes('RGB', shot.size, shot.rgb)
            meta = {
                'width': shot.width,
                'height': shot.height,
                'left': shot.left,
                'top': shot.top,
                'method': method
            }
            return img, meta
    except Exception as err:
        logger.error(f"MSS fallback capture failed: {err}")
        return None


def _fallback_capture_with_dxcam(region: Optional[Dict[str, int]] = None, monitor_index: int = 0) -> Optional[Tuple["Image.Image", Dict[str, int]]]:
    if not DXCAM_AVAILABLE:
        return None
    try:
        camera = dxcam.create(device_idx=monitor_index)
        if region:
            left = int(region['left'])
            top = int(region['top'])
            width = int(region['width'])
            height = int(region['height'])
            right = left + width
            bottom = top + height
            frame = camera.grab(region=(left, top, right, bottom))
            meta = {'width': width, 'height': height, 'left': left, 'top': top, 'method': 'dxcam_window'}
        else:
            frame = camera.grab()
            if frame is None:
                return None
            height, width = frame.shape[:2]
            meta = {'width': width, 'height': height, 'left': 0, 'top': 0, 'method': 'dxcam_monitor'}
        if frame is None:
            return None
        # dxcam returns BGRA; drop alpha and convert to RGB
        if frame.shape[-1] == 4:
            frame = frame[:, :, :3]
        img = Image.fromarray(frame[:, :, ::-1], 'RGB')
        for cleanup in ("stop", "release"):
            try:
                getattr(camera, cleanup)()
            except Exception:
                continue
        return img, meta
    except Exception as err:
        logger.error(f"DXCAM fallback capture failed: {err}")
        return None


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
        # Include CAPTUREBLT so layered windows (e.g. Teams, Zoom) render in the capture
        mem_dc.BitBlt(
            (0, 0),                # Destination
            (width, height),       # Size
            img_dc,                # Source DC
            (left, top),           # Source position
            win32con.SRCCOPY | win32con.CAPTUREBLT
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

        capture_method = 'windows_gdi'

        if _is_blank_image(img):
            fallback = _fallback_capture_with_mss(monitor_index=monitor_index)
            if not fallback:
                fallback = _fallback_capture_with_dxcam(monitor_index=monitor_index)
            if fallback:
                img, meta = fallback
                width = meta['width']
                height = meta['height']
                capture_method = meta.get('method', 'fallback_monitor')
                logger.info("Primary GDI capture returned blank image; used fallback capture")
            else:
                logger.warning("Primary GDI capture returned blank image and no fallback capture succeeded")
        
        # Clean up Windows resources
        mem_dc.DeleteDC()
        win32gui.DeleteObject(screenshot.GetHandle())
        win32gui.ReleaseDC(hdesktop, desktop_dc)
        
        # Ensure width/height sync with fallback result
        width = img.width
        height = img.height
        if capture_method == 'windows_gdi':
            meta_method = 'windows_gdi'
        elif capture_method in ('mss_monitor', 'mss_window', 'dxcam_monitor', 'dxcam_window'):
            meta_method = capture_method
        else:
            meta_method = 'fallback'

        img_base64, width, height = _encode_image(img)
        
        logger.info(f"✅ Windows capture successful: {width}x{height}, {len(img_base64)} bytes")
        
        return {
            'image': img_base64,
            'width': width,
            'height': height,
            'format': 'png',
            'method': meta_method
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
        # Try PrintWindow with different flags for better browser/app content capture
        result = 0
        
        # For browsers and coding platforms, try different strategies
        is_browser = _is_browser_window(window_text)
        is_coding = _is_coding_platform_window(window_text)
        is_teams = _is_teams_window(window_text)
        is_sharing = _is_screen_sharing_active(window_text)
        
        if is_browser or is_coding:
            logger.info(f"Detected browser/coding platform window: {window_text}")
            # For browsers, try PW_CLIENTONLY first to get client area
            if win32gui.PrintWindow:
                result = win32gui.PrintWindow(hwnd, save_dc.GetSafeHdc(), 1)  # PW_CLIENTONLY
                if result != 0:
                    logger.info("Used PW_CLIENTONLY for browser window")
        
        elif is_teams and is_sharing:
            logger.info(f"Detected Teams screen sharing window: {window_text}")
            # For Teams screen sharing, skip PrintWindow and go straight to fallbacks
            # as the shared content is often hardware-accelerated
            result = 0  # Force fallback usage
        
        # If not a browser or PW_CLIENTONLY failed, try PW_RENDERFULLCONTENT
        if result == 0 and win32gui.PrintWindow and not (is_teams and is_sharing):
            result = win32gui.PrintWindow(hwnd, save_dc.GetSafeHdc(), 2)  # PW_RENDERFULLCONTENT
        
        # If PrintWindow fails completely, fall back to BitBlt
        if result == 0 and not (is_teams and is_sharing):
            # CAPTUREBLT ensures Windows composited layers from apps like Teams are included
            save_dc.BitBlt(
                (0, 0),
                (width, height),
                mfc_dc,
                (0, 0),
                win32con.SRCCOPY | win32con.CAPTUREBLT
            )
            logger.info("PrintWindow failed, used BitBlt fallback")
        
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
        
        # For browsers and coding platforms, try to crop out UI chrome
        if is_browser or is_coding:
            try:
                # Estimate browser chrome height (title bar + tabs + address bar)
                # This is a rough heuristic - could be improved with better detection
                chrome_height = int(height * 0.15)  # Assume top 15% is chrome
                if chrome_height > 100:  # Don't crop too much
                    chrome_height = 100
                
                # Crop out the top chrome area
                img = img.crop((0, chrome_height, width, height))
                height = img.height
                logger.info(f"Cropped browser chrome: {width}x{height}")
            except Exception as crop_err:
                logger.warning(f"Browser cropping failed: {crop_err}")
        
        capture_method = 'windows_window'
        
        # For Teams screen sharing, prioritize DXCAM fallback
        if _is_blank_image(img) or result == 0 or (is_teams and is_sharing):
            if is_teams and is_sharing:
                logger.info("Teams screen sharing detected - prioritizing DXCAM capture")
                # Try DXCAM first for Teams screen sharing
                fallback = _fallback_capture_with_dxcam({
                    'left': left,
                    'top': top,
                    'width': width,
                    'height': height
                })
                if not fallback:
                    fallback = _fallback_capture_with_mss({
                        'left': left,
                        'top': top,
                        'width': width,
                        'height': height
                    })
            else:
                # Normal fallback order
                fallback = _fallback_capture_with_mss({
                    'left': left,
                    'top': top,
                    'width': width,
                    'height': height
                })
                if not fallback:
                    fallback = _fallback_capture_with_dxcam({
                        'left': left,
                        'top': top,
                        'width': width,
                        'height': height
                    })
            
            if fallback:
                img, meta = fallback
                capture_method = meta.get('method', 'fallback_window') if isinstance(meta, dict) else 'fallback_window'
                width = img.width
                height = img.height
                logger.info("Primary window capture unavailable; used fallback")
            else:
                logger.warning("Primary window capture unavailable and no fallback capture succeeded")
        
        # Clean up
        save_dc.DeleteDC()
        mfc_dc.DeleteDC()
        win32gui.ReleaseDC(hwnd, hwnd_dc)
        win32gui.DeleteObject(bitmap.GetHandle())
        
        width = img.width
        height = img.height

        if capture_method == 'windows_window':
            meta_method = 'windows_window'
        elif capture_method in ('mss_window', 'dxcam_window'):
            meta_method = capture_method
        else:
            meta_method = 'fallback'

        img_base64, width, height = _encode_image(img)
        
        logger.info(f"✅ Window capture successful: {width}x{height}, {len(img_base64)} bytes")
        
        return {
            'image': img_base64,
            'width': width,
            'height': height,
            'format': 'png',
            'method': meta_method,
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
