"""
Test script for Windows native capture functionality
Run this to verify the Windows capture feature is working correctly
"""

import sys
import os

# Add parent directory to path to import modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def test_import():
    """Test if windows_capture module can be imported"""
    print("🔍 Testing module import...")
    try:
        from python.windows_capture import (
            capture_screen_windows,
            capture_window_windows,
            get_available_windows,
            is_windows_capture_available
        )
        print("✅ Module imported successfully")
        return True
    except ImportError as e:
        print(f"❌ Failed to import module: {e}")
        print("\nTo fix:")
        print("  pip install pywin32")
        return False

def test_availability():
    """Test if Windows capture is available"""
    print("\n🔍 Testing availability...")
    try:
        from python.windows_capture import is_windows_capture_available
        
        if is_windows_capture_available():
            print("✅ Windows capture is available")
            return True
        else:
            print("❌ Windows capture not available (pywin32 not installed)")
            print("\nTo fix:")
            print("  pip install pywin32")
            return False
    except Exception as e:
        print(f"❌ Error checking availability: {e}")
        return False

def test_screen_capture():
    """Test full screen capture"""
    print("\n🔍 Testing screen capture...")
    try:
        from python.windows_capture import capture_screen_windows
        
        result = capture_screen_windows(monitor_index=0)
        
        if result:
            print(f"✅ Screen captured successfully")
            print(f"   Size: {result['width']}x{result['height']}")
            print(f"   Format: {result['format']}")
            print(f"   Method: {result['method']}")
            print(f"   Data: {len(result['image'])} bytes (base64)")
            return True
        else:
            print("❌ Screen capture returned None")
            return False
            
    except Exception as e:
        print(f"❌ Screen capture failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_window_list():
    """Test window enumeration"""
    print("\n🔍 Testing window enumeration...")
    try:
        from python.windows_capture import get_available_windows
        
        windows = get_available_windows()
        
        if windows:
            print(f"✅ Found {len(windows)} windows")
            print("\nFirst 5 windows:")
            for i, window in enumerate(windows[:5]):
                print(f"   {i+1}. {window['title']}")
            return True
        else:
            print("⚠️  No windows found (this is unusual)")
            return False
            
    except Exception as e:
        print(f"❌ Window enumeration failed: {e}")
        return False

def test_window_capture():
    """Test capturing a specific window"""
    print("\n🔍 Testing window capture...")
    try:
        from python.windows_capture import capture_window_windows, get_available_windows
        
        # Get first available window
        windows = get_available_windows()
        if not windows:
            print("⚠️  No windows available to test")
            return False
        
        test_window = windows[0]
        print(f"   Attempting to capture: {test_window['title']}")
        
        result = capture_window_windows(window_title=test_window['title'])
        
        if result:
            print(f"✅ Window captured successfully")
            print(f"   Window: {result['window_title']}")
            print(f"   Size: {result['width']}x{result['height']}")
            return True
        else:
            print("❌ Window capture returned None")
            return False
            
    except Exception as e:
        print(f"❌ Window capture failed: {e}")
        return False

def main():
    """Run all tests"""
    print("=" * 60)
    print("Windows Native Capture Test Suite")
    print("=" * 60)
    
    results = []
    
    # Test 1: Import
    results.append(("Module Import", test_import()))
    
    if not results[0][1]:
        print("\n" + "=" * 60)
        print("Cannot continue - module not available")
        print("Install pywin32: pip install pywin32")
        print("=" * 60)
        return
    
    # Test 2: Availability
    results.append(("Availability Check", test_availability()))
    
    if not results[1][1]:
        print("\n" + "=" * 60)
        print("Cannot continue - feature not available")
        print("=" * 60)
        return
    
    # Test 3: Screen Capture
    results.append(("Screen Capture", test_screen_capture()))
    
    # Test 4: Window List
    results.append(("Window Enumeration", test_window_list()))
    
    # Test 5: Window Capture
    results.append(("Window Capture", test_window_capture()))
    
    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print("=" * 60)
    print(f"Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! Windows capture is working correctly.")
        print("\nYou can now:")
        print("  • Capture restricted applications")
        print("  • Use the windows_capture WebSocket messages")
        print("  • Access via electronAPI.captureScreenWindows()")
    else:
        print("\n⚠️  Some tests failed. Check the output above for details.")
    
    print("=" * 60)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Test interrupted by user")
    except Exception as e:
        print(f"\n\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
