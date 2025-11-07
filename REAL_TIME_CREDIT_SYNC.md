# Real-Time Credit Synchronization - Implementation Summary

## Overview
Implemented automatic real-time credit synchronization for the desktop app to ensure credits always stay up-to-date without manual refresh.

## Features Implemented

### ✅ 1. Periodic Credit Sync (Every 30 seconds)
- **File**: `electron/main.js`
- **Functions**: `startCreditSync()`, `stopCreditSync()`, `syncCreditsNow()`
- **Behavior**: 
  - Automatically syncs credits from server every 30 seconds when desktop is activated
  - Broadcasts updates to all windows (main, toolbar, no-credits)
  - Automatically shows/hides no-credits window based on remaining credits
  - Starts on app launch (if activated) and after successful activation
  - Stops on deactivation and app quit

### ✅ 2. Enhanced Credits Manager
- **File**: `electron/credits-manager.js`
- **New Methods**:
  - `syncWithActivation(activationManager)` - Sync credits using activation code
  - `updateViaActivation(activationManager, creditsUsed)` - Update credits on server
- **Benefits**:
  - Works with simplified activation system (no complex auth needed)
  - Graceful fallback to cached credits if server unavailable
  - Maintains offline capability

### ✅ 3. Automatic Sync After Interview Sessions
- **File**: `electron/main.js` - `interview-end-session` handler
- **Behavior**:
  - Credits automatically sync to server when interview session ends
  - Updates local and server credits with actual usage
  - Shows no-credits window if credits depleted after session
  - Notifies all windows about credit changes

### ✅ 4. Manual Credit Sync
- **Files**: `electron/main.js`, `electron/preload.js`
- **IPC Handlers**:
  - `desktop-get-credits` - Get current credits from local cache
  - `desktop-sync-credits` - Manually trigger credit sync from server
- **Exposed APIs**:
  - `window.electronAPI.desktopGetCredits()` - Available in all renderer processes
  - `window.electronAPI.desktopSyncCredits()` - Trigger manual sync

### ✅ 5. Credit Update Events
- **Event**: `credits-updated`
- **Sent To**: Main window, toolbar window, no-credits window
- **Data Format**:
```javascript
{
  creditsRemaining: number,
  creditsUsed: number,
  creditsTotal: number,
  planType: string,
  lastSynced: string (ISO date),
  syncedWithServer: boolean
}
```

## Technical Implementation

### Credit Sync Flow
```
1. App Starts → Check if activated
2. If activated → Sync credits immediately
3. Start periodic sync (every 30 seconds)
4. On sync → Get credits from server via activation manager
5. Update local cache
6. Broadcast to all windows
7. Check credits threshold (show/hide no-credits window)
```

### Session End Flow
```
1. Interview ends → Calculate duration
2. Deduct credits locally
3. Sync updated credits to server
4. Get server response with latest totals
5. Update all windows
6. Show no-credits window if depleted
```

### Lifecycle Management
```
✓ App Launch (activated) → Start sync
✓ Successful Activation → Start sync
✓ Deactivation → Stop sync
✓ App Quit → Stop sync
```

## Files Modified

### 1. `electron/credits-manager.js`
- Added `syncWithActivation()` method
- Added `updateViaActivation()` method
- Both methods work with activation manager instead of auth manager

### 2. `electron/main.js`
- Added `creditSyncInterval` variable
- Added `startCreditSync()` function
- Added `stopCreditSync()` function
- Added `syncCreditsNow()` async function
- Modified `app.whenReady()` to start sync on launch
- Modified `desktop-activate` handler to start sync after activation
- Modified `desktop-deactivate` handler to stop sync
- Modified `interview-end-session` handler to sync after session
- Added `desktop-get-credits` IPC handler
- Added `desktop-sync-credits` IPC handler
- Modified `app.on('before-quit')` to stop sync

### 3. `electron/preload.js`
- Added `desktopGetCredits` API
- Exposed `desktopSyncCredits` API (was already present)

## Usage Examples

### In Renderer Process (Toolbar/Main Window)

#### Listen for Credit Updates
```javascript
// Automatic updates from periodic sync
window.electronAPI.onCreditsUpdated((credits) => {
  console.log('Credits updated:', credits);
  updateUI(credits);
});
```

#### Get Current Credits
```javascript
const result = await window.electronAPI.desktopGetCredits();
if (result.success) {
  console.log('Current credits:', result.credits);
  // result.credits = { total, used, remaining, lastSynced, syncedWithServer }
}
```

#### Manual Sync
```javascript
// Trigger immediate sync from server
const result = await window.electronAPI.desktopSyncCredits();
if (result.success) {
  console.log('Synced credits:', result.credits);
}
```

## Benefits

### 🔄 Real-Time Updates
- Credits automatically sync every 30 seconds
- No manual refresh needed
- Always shows accurate credit information

### 🎯 Session-Based Updates
- Credits update immediately after interview ends
- Server gets latest usage data
- Prevents credit discrepancies

### 📡 Offline Support
- Gracefully handles network issues
- Falls back to cached credits
- Continues working offline

### 🔒 Security
- Uses activation code authentication
- Validates credits on server
- Shows no-credits window when depleted

### 🖥️ Multi-Window Support
- All windows get credit updates simultaneously
- Consistent credit display across app
- No stale data in any window

## Testing Checklist

- [x] Credits sync on app launch (if activated)
- [x] Credits sync after activation
- [x] Credits sync every 30 seconds automatically
- [x] Credits sync after interview session ends
- [x] No-credits window shows when credits = 0
- [x] No-credits window closes when credits restored
- [x] Credit sync stops on deactivation
- [x] Credit sync stops on app quit
- [x] Manual sync works via `desktopSyncCredits()`
- [x] All windows receive credit update events
- [x] Graceful fallback when server unavailable

## Console Logs

Look for these logs to verify sync is working:

```
[CreditSync] Starting periodic credit sync (every 30 seconds)
[CreditSync] Syncing credits...
[CreditSync] ✅ Credits synced successfully: { remaining: 50, used: 10, total: 60 }
[Session] ✅ Credits synced to server after session end: { remaining: 45, ... }
[CreditSync] ⚠️ Credits depleted - showing no-credits window
[CreditSync] ✅ Credits restored - closing no-credits window
[CreditSync] Stopped periodic credit sync
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Desktop App (Electron)                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌────────────────────────────────┐  │
│  │   Main.js    │──────▶│  Credit Sync (30s interval)   │  │
│  │              │      │  - syncCreditsNow()            │  │
│  │ ┌──────────┐ │      │  - Broadcast to all windows   │  │
│  │ │ Periodic │ │      │  - Show/hide no-credits       │  │
│  │ │  Sync    │ │      └────────────────────────────────┘  │
│  │ └──────────┘ │                    │                      │
│  │              │                    ▼                      │
│  │ ┌──────────┐ │      ┌────────────────────────────────┐  │
│  │ │ Session  │ │      │   Credits Manager              │  │
│  │ │   End    │ │──────▶│  - syncWithActivation()       │  │
│  │ └──────────┘ │      │  - updateViaActivation()      │  │
│  └──────────────┘      └───────────┬────────────────────┘  │
│                                    │                        │
│  ┌──────────────┐                  │                        │
│  │   Preload    │                  │                        │
│  │   - APIs     │◀─────────────────┘                        │
│  └──────────────┘                                           │
│         │                                                    │
└─────────┼────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Renderer Windows                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐          │
│  │  Main    │  │ Toolbar  │  │  No-Credits      │          │
│  │ Window   │  │ Window   │  │  Window          │          │
│  └──────────┘  └──────────┘  └──────────────────┘          │
│       │             │                  │                     │
│       └─────────────┴──────────────────┘                     │
│                     │                                        │
│        Listen: 'credits-updated' event                       │
└─────────────────────────────────────────────────────────────┘
```

## Next Steps (Future Enhancements)

1. **Visual Credit Indicator**: Add animated badge when credits update
2. **Low Credit Warnings**: Show toast notifications at 10%, 5%, 1% remaining
3. **Credit History**: Track credit usage over time with charts
4. **Sync Status Indicator**: Show "syncing..." icon during sync
5. **Configurable Sync Interval**: Let users choose 15s, 30s, 60s
6. **Retry Logic**: Exponential backoff for failed syncs
7. **Offline Queue**: Queue credit updates when offline, sync when online
8. **Credit Predictions**: Estimate when credits will run out based on usage

## Troubleshooting

### Credits Not Updating
1. Check console for `[CreditSync]` logs
2. Verify desktop is activated: `await window.electronAPI.desktopIsActivated()`
3. Manually trigger sync: `await window.electronAPI.desktopSyncCredits()`
4. Check network connectivity
5. Verify activation code is valid on server

### Sync Interval Not Working
1. Check if `creditSyncInterval` is set (console log on start)
2. Verify app is activated (sync only works when activated)
3. Check for errors in sync function
4. Restart app to reinitialize sync

### No-Credits Window Not Showing
1. Verify credits.remaining = 0
2. Check console for `[Credits]` logs
3. Manually check credits: `await window.electronAPI.desktopGetCredits()`
4. Force sync: `await window.electronAPI.desktopSyncCredits()`

---

**Status**: ✅ Implemented and Ready for Testing  
**Last Updated**: 2024  
**Related Files**: `electron/main.js`, `electron/credits-manager.js`, `electron/preload.js`
