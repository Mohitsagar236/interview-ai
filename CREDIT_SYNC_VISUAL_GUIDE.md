# Real-Time Credit Sync - Visual Guide

## 🎬 Credit Flow Animation

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DESKTOP APP LIFECYCLE                             │
└─────────────────────────────────────────────────────────────────────┘

1️⃣ APP STARTS (Activated)
   ┌──────────┐
   │ Launch   │
   │ App      │
   └────┬─────┘
        │
        ▼
   ┌────────────────┐      ┌──────────────┐
   │ Check          │─────▶│ Activated?   │
   │ Activation     │      │ ✅ YES       │
   └────────────────┘      └──────┬───────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ Sync Credits    │◀─── Initial sync
                         │ from Server     │
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ Start Timer     │◀─── Every 30s
                         │ (30s interval)  │
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ Show Main/      │
                         │ Toolbar Window  │
                         └─────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2️⃣ PERIODIC SYNC (Every 30 seconds)
   
   ⏰ Timer Triggers
        │
        ▼
   ┌─────────────────┐
   │ syncCreditsNow()│
   └────────┬────────┘
            │
            ▼
   ┌──────────────────────────┐
   │ activationManager        │
   │   .getCredits()          │◀─── API call to server
   └───────────┬──────────────┘
               │
               ▼
   ┌──────────────────────────┐
   │ creditsManager           │
   │   .saveCredits(...)      │◀─── Update local cache
   └───────────┬──────────────┘
               │
               ▼
   ┌──────────────────────────┐
   │ Broadcast to all windows │
   │ 'credits-updated' event  │
   └───────────┬──────────────┘
               │
               ├────────────┬──────────────┬──────────────┐
               ▼            ▼              ▼              ▼
         ┌─────────┐  ┌─────────┐  ┌───────────┐  ┌──────────┐
         │  Main   │  │ Toolbar │  │No-Credits │  │  Other   │
         │ Window  │  │ Window  │  │  Window   │  │ Windows  │
         └─────────┘  └─────────┘  └───────────┘  └──────────┘
              │
              ▼
         All UIs update instantly! ✨

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3️⃣ INTERVIEW SESSION ENDS
   
   👤 User ends interview
        │
        ▼
   ┌─────────────────────┐
   │ interview-end-      │
   │ session handler     │
   └──────────┬──────────┘
              │
              ▼
   ┌─────────────────────┐
   │ creditsManager      │
   │   .endSession(...)  │◀─── Calculate credits used
   └──────────┬──────────┘
              │
              ▼
   ┌─────────────────────┐
   │ creditsManager      │
   │   .updateVia        │◀─── Sync to server
   │   Activation(...)   │
   └──────────┬──────────┘
              │
              ▼
   ┌─────────────────────┐
   │ Check remaining     │
   │ credits             │
   └──────────┬──────────┘
              │
              ├─────────────┬───────────────┐
              ▼             ▼               ▼
         remaining > 0  remaining = 0  Server error
              │             │               │
              ▼             ▼               ▼
     ┌──────────────┐ ┌──────────┐  ┌──────────┐
     │Continue      │ │Show No-  │  │Use cached│
     │normally      │ │Credits   │  │credits   │
     └──────────────┘ │Window    │  └──────────┘
                      └──────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4️⃣ MANUAL SYNC (User clicks refresh)
   
   🖱️ User clicks "Sync"
        │
        ▼
   ┌─────────────────────┐
   │ desktopSyncCredits()│◀─── Renderer process
   └──────────┬──────────┘
              │
              ▼
   ┌─────────────────────┐
   │ IPC call to main    │
   │ process             │
   └──────────┬──────────┘
              │
              ▼
   ┌─────────────────────┐
   │ syncCreditsNow()    │◀─── Trigger sync immediately
   └──────────┬──────────┘
              │
              ▼
   Same flow as periodic sync ↑↑↑
   
   Result returned to renderer
        │
        ▼
   ┌─────────────────────┐
   │ Show success toast  │
   │ "Credits synced!"   │
   └─────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5️⃣ DEACTIVATION
   
   👤 User deactivates
        │
        ▼
   ┌─────────────────────┐
   │ desktop-deactivate  │
   │ handler             │
   └──────────┬──────────┘
              │
              ▼
   ┌─────────────────────┐
   │ stopCreditSync()    │◀─── Stop timer
   └──────────┬──────────┘
              │
              ▼
   ┌─────────────────────┐
   │ Clear credits       │
   │ (set to 0)          │
   └──────────┬──────────┘
              │
              ▼
   ┌─────────────────────┐
   │ Close all windows   │
   └─────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

6️⃣ APP QUIT
   
   ❌ User quits app
        │
        ▼
   ┌─────────────────────┐
   │ app.on('before-     │
   │ quit') event        │
   └──────────┬──────────┘
              │
              ▼
   ┌─────────────────────┐
   │ stopCreditSync()    │◀─── Clean up timer
   └──────────┬──────────┘
              │
              ▼
   ┌─────────────────────┐
   │ Cleanup complete    │
   │ App exits           │
   └─────────────────────┘
```

## 📊 Credit State Transitions

```
┌──────────────────────────────────────────────────────────────┐
│                     CREDIT STATES                             │
└──────────────────────────────────────────────────────────────┘

STATE 1: SUFFICIENT CREDITS (remaining > 0)
┌─────────────────────────────────────┐
│  Credits: 50 / 100                  │
│  Status: ✅ Active                  │
│  Windows: Toolbar visible           │
│  Action: Allow interview sessions   │
└─────────────────────────────────────┘
                │
                │ (Credits decrease during interview)
                ▼
                
STATE 2: LOW CREDITS (remaining < 10)
┌─────────────────────────────────────┐
│  Credits: 5 / 100                   │
│  Status: ⚠️ Low                     │
│  Windows: Warning shown             │
│  Action: Show "Buy more" prompt     │
└─────────────────────────────────────┘
                │
                │ (Continue using credits)
                ▼
                
STATE 3: NO CREDITS (remaining = 0)
┌─────────────────────────────────────┐
│  Credits: 0 / 100                   │
│  Status: ❌ Depleted                │
│  Windows: No-Credits window shown   │
│  Action: Block new sessions         │
└─────────────────────────────────────┘
                │
                │ (User buys more credits)
                ▼
                
STATE 4: CREDITS RESTORED (remaining > 0)
┌─────────────────────────────────────┐
│  Credits: 60 / 160                  │
│  Status: ✅ Active                  │
│  Windows: Toolbar visible           │
│  Action: Close no-credits window    │
└─────────────────────────────────────┘
```

## 🔄 Sync Success vs Failure

```
┌────────────────────────────────────────────────────────────┐
│                    SYNC SCENARIOS                           │
└────────────────────────────────────────────────────────────┘

✅ SUCCESSFUL SYNC
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Client      │───▶│  API Server  │───▶│  Database    │
│  (Desktop)   │    │              │    │  (Supabase)  │
└──────────────┘    └──────────────┘    └──────────────┘
       │                    │                    │
       │  1. Request        │  2. Query DB       │
       │◀───────────────────│◀───────────────────│
       │  3. Response       │                    │
       │    { success:true, │                    │
       │      credits:{...} }                    │
       │                                         │
       ▼                                         │
┌──────────────┐                                │
│ Update cache │                                │
│ Broadcast    │                                │
│ to windows   │                                │
└──────────────┘                                │

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ FAILED SYNC (Network Error)
┌──────────────┐    ┌──────────────┐
│  Client      │───X│  API Server  │ (timeout/error)
│  (Desktop)   │    │              │
└──────────────┘    └──────────────┘
       │
       │  Error: Network timeout
       │
       ▼
┌──────────────┐
│ Use cached   │◀─── Graceful fallback
│ credits      │
│ Show warning │
└──────────────┘
       │
       ▼
┌──────────────┐
│ Retry on     │◀─── Next sync cycle (30s)
│ next cycle   │
└──────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ INVALID ACTIVATION
┌──────────────┐    ┌──────────────┐
│  Client      │───▶│  API Server  │
│  (Desktop)   │    │              │
└──────────────┘    └──────────────┘
       │                    │
       │  Request           │
       │◀───────────────────│
       │  { success:false,  │
       │    error:"Invalid  │
       │    activation" }   │
       │                    │
       ▼                    │
┌──────────────┐           │
│ Show error   │           │
│ Clear local  │           │
│ activation   │           │
│ Show login   │           │
└──────────────┘           │
```

## 🎯 UI Update Flow

```
┌─────────────────────────────────────────────────────────────┐
│              CREDITS UPDATE IN UI                            │
└─────────────────────────────────────────────────────────────┘

MAIN PROCESS (Electron)
┌──────────────────────────────────┐
│  syncCreditsNow()                │
│  - Get credits from server       │
│  - Update local cache            │
│  - Check thresholds              │
└──────────┬───────────────────────┘
           │
           │ Broadcast event
           ▼
┌──────────────────────────────────┐
│  BrowserWindow.webContents.send  │
│  ('credits-updated', credits)    │
└──────────┬───────────────────────┘
           │
           │
━━━━━━━━━━┼━━━━━━━━━━━━━━━━━━━━━━━━
           │
           │ IPC Communication
           ▼
RENDERER PROCESS (HTML/JS)
┌──────────────────────────────────┐
│  window.electronAPI              │
│    .onCreditsUpdated(callback)   │
└──────────┬───────────────────────┘
           │
           │ Listener triggered
           ▼
┌──────────────────────────────────┐
│  Update UI Elements:             │
│  ✅ Credit counter               │
│  ✅ Progress bar                 │
│  ✅ Status indicator             │
│  ✅ Warnings/alerts              │
└──────────────────────────────────┘

EXAMPLE:
  Before: Credits: -- / --  ⏳
  After:  Credits: 45 / 100 ✅
```

## 🛡️ Error Handling

```
┌─────────────────────────────────────────────────────────────┐
│                 ERROR SCENARIOS                              │
└─────────────────────────────────────────────────────────────┘

ERROR 1: Network Timeout
   ┌────────────┐
   │ Try sync   │
   └─────┬──────┘
         │ ❌ Timeout (5s)
         ▼
   ┌────────────┐
   │ Use cache  │───▶ Continue working offline
   └────────────┘
         │
         │ ⏰ Wait 30s
         ▼
   ┌────────────┐
   │ Retry sync │───▶ Try again automatically
   └────────────┘

ERROR 2: Invalid Response
   ┌────────────┐
   │ Get data   │
   └─────┬──────┘
         │ ❌ Parse error
         ▼
   ┌────────────┐
   │ Log error  │───▶ console.error()
   └─────┬──────┘
         │
         ▼
   ┌────────────┐
   │ Use cache  │───▶ Show warning icon
   └────────────┘

ERROR 3: Server Error (500)
   ┌────────────┐
   │ API call   │
   └─────┬──────┘
         │ ❌ 500 error
         ▼
   ┌────────────┐
   │ Retry      │───▶ Exponential backoff
   │ with delay │     (30s, 60s, 120s...)
   └────────────┘
```

## 📱 Multi-Window Sync

```
┌─────────────────────────────────────────────────────────────┐
│           SYNCHRONIZED ACROSS ALL WINDOWS                    │
└─────────────────────────────────────────────────────────────┘

                    🖥️ MAIN PROCESS
                    ┌──────────────┐
                    │ Credit Sync  │
                    │   Manager    │
                    └───────┬──────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
   ┌─────────┐         ┌─────────┐       ┌───────────┐
   │  Main   │         │ Toolbar │       │No-Credits │
   │ Window  │         │ Window  │       │  Window   │
   └────┬────┘         └────┬────┘       └─────┬─────┘
        │                   │                   │
        │ Updates in REAL-TIME (< 100ms)       │
        │                   │                   │
        ▼                   ▼                   ▼
   Credits: 45         Credits: 45         Credits: 45
   
   ALL WINDOWS SHOW THE SAME VALUE INSTANTLY! ⚡
```

---

**Legend**:
- ✅ Success
- ❌ Error/Failed
- ⚠️ Warning
- ⏰ Timer/Scheduled
- 🖱️ User Action
- 📡 Network Request
- 💾 Database
- 🖥️ Main Process
- 🌐 Renderer Process

**Last Updated**: 2024  
**Related Docs**: 
- `REAL_TIME_CREDIT_SYNC.md` (Technical details)
- `CREDIT_SYNC_QUICK_REFERENCE.md` (API reference)
