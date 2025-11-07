# Real-Time Credit Sync - Quick Reference

## 🚀 Quick Start

### For Developers Adding Credit UI

```javascript
// 1. Listen for credit updates (automatic, every 30s)
window.electronAPI.onCreditsUpdated((credits) => {
  document.getElementById('credits-remaining').textContent = credits.remaining;
  document.getElementById('credits-used').textContent = credits.used;
  document.getElementById('credits-total').textContent = credits.total;
});

// 2. Get credits on page load
async function loadCredits() {
  const result = await window.electronAPI.desktopGetCredits();
  if (result.success) {
    updateCreditsUI(result.credits);
  }
}

// 3. Add manual refresh button (optional)
document.getElementById('refresh-btn').addEventListener('click', async () => {
  const result = await window.electronAPI.desktopSyncCredits();
  if (result.success) {
    showToast('Credits synced!');
  }
});
```

## 📋 API Reference

### Get Credits (Cached)
```javascript
const result = await window.electronAPI.desktopGetCredits();
// Returns: { success: boolean, credits?: object, error?: string }
// Credits object: { total, used, remaining, lastSynced, syncedWithServer, planType }
```

### Manual Sync (From Server)
```javascript
const result = await window.electronAPI.desktopSyncCredits();
// Returns: { success: boolean, credits?: object, error?: string }
// Triggers immediate sync and returns latest credits
```

### Listen for Updates
```javascript
window.electronAPI.onCreditsUpdated((credits) => {
  // Automatically called when credits change
  // Credits object: { remaining, used, total, planType, lastSynced, syncedWithServer }
});
```

## 🔧 Configuration

### Sync Interval
Located in `electron/main.js`:
```javascript
// Change this value to adjust sync frequency
creditSyncInterval = setInterval(() => {
  syncCreditsNow();
}, 30000); // 30 seconds (30000ms)
```

### Sync on Events
Credits automatically sync:
- ✅ App launch (if activated)
- ✅ After activation
- ✅ Every 30 seconds
- ✅ After interview session ends
- ✅ On manual trigger

Credits sync STOPS:
- ⛔ On deactivation
- ⛔ On app quit

## 💡 Common Use Cases

### Display Credits in Toolbar
```javascript
// toolbar.html
<div class="credits-display">
  <span id="credits-remaining">--</span> / 
  <span id="credits-total">--</span> credits
</div>

// toolbar.js
window.electronAPI.onCreditsUpdated((credits) => {
  document.getElementById('credits-remaining').textContent = credits.remaining;
  document.getElementById('credits-total').textContent = credits.total;
  
  // Show warning if low
  if (credits.remaining < 5) {
    showLowCreditsWarning();
  }
});
```

### Show Credit Usage After Interview
```javascript
// interview.js
async function endInterview(sessionId) {
  const result = await window.electronAPI.endInterviewSession(sessionId, {});
  
  if (result.ok && result.credits) {
    const { sessionCredits, creditsRemaining } = result.credits;
    showToast(`Session used ${sessionCredits} credits. ${creditsRemaining} remaining.`);
  }
}
```

### Sync Button with Loading State
```javascript
// profile.html
<button id="sync-credits-btn">
  <span class="icon">🔄</span>
  <span class="text">Sync Credits</span>
</button>

// profile.js
const syncBtn = document.getElementById('sync-credits-btn');
syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  syncBtn.querySelector('.text').textContent = 'Syncing...';
  
  const result = await window.electronAPI.desktopSyncCredits();
  
  if (result.success) {
    showToast(`✅ Synced! ${result.credits.remaining} credits remaining`);
  } else {
    showToast(`❌ Sync failed: ${result.error}`);
  }
  
  syncBtn.disabled = false;
  syncBtn.querySelector('.text').textContent = 'Sync Credits';
});
```

### Credit Progress Bar
```javascript
// progress-bar.js
window.electronAPI.onCreditsUpdated((credits) => {
  const percentage = (credits.remaining / credits.total) * 100;
  const progressBar = document.getElementById('credits-progress');
  
  progressBar.style.width = percentage + '%';
  progressBar.classList.remove('low', 'medium', 'high');
  
  if (percentage < 20) {
    progressBar.classList.add('low'); // Red
  } else if (percentage < 50) {
    progressBar.classList.add('medium'); // Yellow
  } else {
    progressBar.classList.add('high'); // Green
  }
});
```

## 🐛 Debugging

### Check Sync Status
Open DevTools console and run:
```javascript
// Check if activated
const activated = await window.electronAPI.desktopIsActivated();
console.log('Activated:', activated);

// Get current credits
const credits = await window.electronAPI.desktopGetCredits();
console.log('Credits:', credits);

// Force sync
const synced = await window.electronAPI.desktopSyncCredits();
console.log('Synced:', synced);
```

### Console Logs to Monitor
```
[CreditSync] Starting periodic credit sync (every 30 seconds)
[CreditSync] Syncing credits...
[CreditSync] ✅ Credits synced successfully: { remaining: 50 }
[Session] ✅ Credits synced to server after session end
```

### Common Issues

**Issue**: Credits not updating in UI
```javascript
// Solution: Make sure you're listening for updates
window.electronAPI.onCreditsUpdated((credits) => {
  console.log('Received update:', credits);
  // Update your UI here
});
```

**Issue**: "Desktop not activated" error
```javascript
// Solution: Check activation status first
const isActivated = await window.electronAPI.desktopIsActivated();
if (!isActivated) {
  // Show activation prompt
  await window.electronAPI.desktopOpenActivation();
}
```

**Issue**: Stale credit data
```javascript
// Solution: Trigger manual sync
await window.electronAPI.desktopSyncCredits();
```

## 📊 Credit Data Structure

```typescript
interface Credits {
  total: number;           // Total credits allocated
  used: number;            // Credits used so far
  remaining: number;       // Credits available (total - used)
  lastSynced: string;     // ISO date of last sync
  syncedWithServer: boolean; // True if synced, false if cached
  planType: string;       // 'free', 'basic', 'pro', 'enterprise'
}
```

## 🎯 Best Practices

### 1. Always Handle Errors
```javascript
const result = await window.electronAPI.desktopGetCredits();
if (!result.success) {
  console.error('Failed to get credits:', result.error);
  showErrorMessage('Unable to load credits. Please try again.');
  return;
}
```

### 2. Show Sync Status
```javascript
let isSyncing = false;

async function syncCredits() {
  if (isSyncing) return; // Prevent multiple syncs
  
  isSyncing = true;
  showSyncIndicator(true);
  
  const result = await window.electronAPI.desktopSyncCredits();
  
  isSyncing = false;
  showSyncIndicator(false);
  
  return result;
}
```

### 3. Cache Credits Locally
```javascript
let cachedCredits = null;

window.electronAPI.onCreditsUpdated((credits) => {
  cachedCredits = credits;
  updateUI(credits);
});

function getCredits() {
  return cachedCredits || { remaining: 0, used: 0, total: 0 };
}
```

### 4. Warn Before Credit-Heavy Actions
```javascript
async function startInterviewSession() {
  const credits = await window.electronAPI.desktopGetCredits();
  
  if (!credits.success || credits.credits.remaining < 1) {
    showAlert('You need at least 1 credit to start an interview.');
    return;
  }
  
  // Start interview...
}
```

## 🔗 Related Files

- **Main Process**: `electron/main.js` (sync logic)
- **Credits Manager**: `electron/credits-manager.js` (sync methods)
- **Preload**: `electron/preload.js` (API exposure)
- **Documentation**: `REAL_TIME_CREDIT_SYNC.md` (full details)

## 📞 Support

If credits are not syncing:
1. Check console for `[CreditSync]` logs
2. Verify network connectivity
3. Confirm desktop is activated
4. Try manual sync: `await window.electronAPI.desktopSyncCredits()`
5. Restart the app

---

**Last Updated**: 2024  
**Version**: 1.0.0  
**Status**: ✅ Production Ready
