/**
 * Credits Manager for Interview AI Desktop App
 * Manages time-based credits: 1 credit = 1 hour of interview time
 * 
 * Credit Plans:
 * - Basic: 3 credits (3 hours)
 * - Plus: 8 credits (6 + 2 free = 8 hours)
 * - Advanced: 15 credits (9 + 6 free = 15 hours)
 */

const fs = require('fs');
const path = require('path');

class CreditsManager {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.creditsPath = path.join(dataDir, 'credits.json');
    this.sessionsPath = path.join(dataDir, 'credit-sessions.json');
    
    // Initialize files if they don't exist
    this.initializeFiles();
    
    // Active session tracking
    this.activeSession = null;
  }

  /**
   * Initialize credit files
   */
  initializeFiles() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }

      // Initialize credits file
      if (!fs.existsSync(this.creditsPath)) {
        const defaultCredits = {
          total: 0,
          used: 0,
          remaining: 0,
          lastSynced: null,
          syncedWithServer: false
        };
        fs.writeFileSync(this.creditsPath, JSON.stringify(defaultCredits, null, 2));
      }

      // Initialize sessions file
      if (!fs.existsSync(this.sessionsPath)) {
        const defaultSessions = {
          sessions: [],
          totalTimeSeconds: 0
        };
        fs.writeFileSync(this.sessionsPath, JSON.stringify(defaultSessions, null, 2));
      }
    } catch (error) {
      console.error('[Credits] Error initializing files:', error);
    }
  }

  /**
   * Load credits from local storage
   */
  loadCredits() {
    try {
      const data = fs.readFileSync(this.creditsPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('[Credits] Error loading credits:', error);
      return { total: 0, used: 0, remaining: 0, lastSynced: null, syncedWithServer: false };
    }
  }

  /**
   * Save credits to local storage
   */
  saveCredits(credits) {
    try {
      fs.writeFileSync(this.creditsPath, JSON.stringify(credits, null, 2));
      return true;
    } catch (error) {
      console.error('[Credits] Error saving credits:', error);
      return false;
    }
  }

  /**
   * Load session history
   */
  loadSessions() {
    try {
      const data = fs.readFileSync(this.sessionsPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('[Credits] Error loading sessions:', error);
      return { sessions: [], totalTimeSeconds: 0 };
    }
  }

  /**
   * Save session history
   */
  saveSessions(sessionData) {
    try {
      fs.writeFileSync(this.sessionsPath, JSON.stringify(sessionData, null, 2));
      return true;
    } catch (error) {
      console.error('[Credits] Error saving sessions:', error);
      return false;
    }
  }

  /**
   * Sync credits from server (Supabase)
   */
  async syncFromServer(userId, supabaseClient) {
    try {
      console.log('[Credits] Syncing credits from server for user:', userId);

      if (!supabaseClient) {
        throw new Error('Supabase client not provided');
      }

      // Fetch user's subscription data
      const { data, error } = await supabaseClient
        .from('subscriptions')
        .select('credits_total, credits_used, plan_type')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('[Credits] Error fetching from server:', error);
        return { success: false, error: error.message };
      }

      if (!data) {
        // No subscription found, user has 0 credits
        const credits = {
          total: 0,
          used: 0,
          remaining: 0,
          lastSynced: new Date().toISOString(),
          syncedWithServer: true,
          planType: 'free'
        };
        this.saveCredits(credits);
        return { success: true, credits };
      }

      // Update local credits
      const credits = {
        total: data.credits_total || 0,
        used: data.credits_used || 0,
        remaining: (data.credits_total || 0) - (data.credits_used || 0),
        lastSynced: new Date().toISOString(),
        syncedWithServer: true,
        planType: data.plan_type || 'free'
      };

      this.saveCredits(credits);
      console.log('[Credits] Successfully synced from server:', credits);

      return { success: true, credits };
    } catch (error) {
      console.error('[Credits] Error syncing from server:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update credits on server (Supabase)
   */
  async updateServer(userId, creditsUsed, supabaseClient) {
    try {
      console.log('[Credits] Updating server with credits used:', creditsUsed);

      if (!supabaseClient) {
        throw new Error('Supabase client not provided');
      }

      // Update credits_used on server
      const { data, error } = await supabaseClient
        .from('subscriptions')
        .update({ credits_used: creditsUsed })
        .eq('user_id', userId)
        .select();

      if (error) {
        console.error('[Credits] Error updating server:', error);
        return { success: false, error: error.message };
      }

      console.log('[Credits] Successfully updated server');
      return { success: true, data };
    } catch (error) {
      console.error('[Credits] Error updating server:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync credits using activation manager (NEW METHOD)
   */
  async syncWithActivation(activationManager) {
    try {
      console.log('[Credits] Syncing credits via activation manager...');

      if (!activationManager || !activationManager.isActivated()) {
        throw new Error('Activation manager not available or not activated');
      }

      // Get latest credits from server
      const result = await activationManager.getCredits();

      if (result.success) {
        const credits = {
          total: result.credits.total,
          used: result.credits.used,
          remaining: result.credits.remaining,
          lastSynced: new Date().toISOString(),
          syncedWithServer: true,
          planType: result.planType || 'free'
        };

        this.saveCredits(credits);
        console.log('[Credits] ✅ Synced via activation:', credits);
        return { success: true, credits };
      } else {
        // Use cached data if available
        const cachedCredits = this.loadCredits();
        console.log('[Credits] ⚠️ Using cached credits:', cachedCredits);
        return { success: false, error: result.error, credits: cachedCredits, cached: true };
      }
    } catch (error) {
      console.error('[Credits] Error syncing via activation:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update credits used via activation manager (NEW METHOD)
   */
  async updateViaActivation(activationManager, creditsUsed) {
    try {
      console.log('[Credits] Updating credits via activation manager:', creditsUsed);

      if (!activationManager || !activationManager.isActivated()) {
        throw new Error('Activation manager not available or not activated');
      }

      // Update credits on server
      const result = await activationManager.updateCredits(creditsUsed);

      if (result.success) {
        // Update local credits
        const credits = {
          total: result.credits.total,
          used: result.credits.used,
          remaining: result.credits.remaining,
          lastSynced: new Date().toISOString(),
          syncedWithServer: true,
          planType: this.loadCredits().planType || 'free'
        };

        this.saveCredits(credits);
        console.log('[Credits] ✅ Updated via activation:', credits);
        return { success: true, credits };
      } else {
        // Update local cache anyway
        const currentCredits = this.loadCredits();
        currentCredits.used = creditsUsed;
        currentCredits.remaining = currentCredits.total - creditsUsed;
        this.saveCredits(currentCredits);
        
        console.log('[Credits] ⚠️ Updated locally (cached):', currentCredits);
        return { success: false, error: result.error, credits: currentCredits, cached: true };
      }
    } catch (error) {
      console.error('[Credits] Error updating via activation:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if user has enough credits
   */
  hasCredits(hoursNeeded = 0) {
    const credits = this.loadCredits();
    return credits.remaining >= hoursNeeded;
  }

  /**
   * Get remaining credits info
   */
  getCreditsInfo() {
    const credits = this.loadCredits();
    const sessions = this.loadSessions();
    
    return {
      total: credits.total,
      used: credits.used,
      remaining: credits.remaining,
      totalTimeSeconds: sessions.totalTimeSeconds,
      totalTimeHours: (sessions.totalTimeSeconds / 3600).toFixed(2),
      sessionsCount: sessions.sessions.length,
      lastSynced: credits.lastSynced,
      planType: credits.planType || 'free'
    };
  }

  /**
   * Start a new session
   */
  startSession(sessionId) {
    if (this.activeSession) {
      console.warn('[Credits] Session already active:', this.activeSession.id);
      return { success: false, error: 'Session already active' };
    }

    // Check if user has credits
    if (!this.hasCredits()) {
      console.warn('[Credits] No credits remaining');
      return { success: false, error: 'No credits remaining' };
    }

    this.activeSession = {
      id: sessionId,
      startTime: Date.now(),
      startedAt: new Date().toISOString()
    };

    console.log('[Credits] Session started:', this.activeSession);
    return { success: true, session: this.activeSession };
  }

  /**
   * End active session and deduct credits
   */
  endSession(sessionId, durationSeconds) {
    if (!this.activeSession || this.activeSession.id !== sessionId) {
      console.warn('[Credits] No active session to end');
      return { success: false, error: 'No active session' };
    }

    // Calculate time used in hours
    const timeSeconds = durationSeconds || Math.floor((Date.now() - this.activeSession.startTime) / 1000);
    const timeHours = timeSeconds / 3600;
    
    // Round up to nearest 0.1 hour (6 minutes)
    const creditsToDeduct = Math.ceil(timeHours * 10) / 10;

    console.log('[Credits] Session ended:', {
      sessionId,
      timeSeconds,
      timeHours: timeHours.toFixed(2),
      creditsToDeduct
    });

    // Load current credits
    const credits = this.loadCredits();
    const sessions = this.loadSessions();

    // Deduct credits
    credits.used = Math.min(credits.total, credits.used + creditsToDeduct);
    credits.remaining = credits.total - credits.used;

    // Save session record
    const sessionRecord = {
      id: sessionId,
      startedAt: this.activeSession.startedAt,
      endedAt: new Date().toISOString(),
      durationSeconds: timeSeconds,
      creditsDeducted: creditsToDeduct
    };

    sessions.sessions.push(sessionRecord);
    sessions.totalTimeSeconds += timeSeconds;

    // Save to files
    this.saveCredits(credits);
    this.saveSessions(sessions);

    // Clear active session
    this.activeSession = null;

    return {
      success: true,
      session: sessionRecord,
      creditsRemaining: credits.remaining,
      creditsUsed: credits.used
    };
  }

  /**
   * Get active session info
   */
  getActiveSession() {
    if (!this.activeSession) {
      return null;
    }

    const elapsedSeconds = Math.floor((Date.now() - this.activeSession.startTime) / 1000);
    const elapsedHours = (elapsedSeconds / 3600).toFixed(2);
    const estimatedCredits = Math.ceil((elapsedSeconds / 3600) * 10) / 10;

    return {
      ...this.activeSession,
      elapsedSeconds,
      elapsedHours,
      estimatedCredits
    };
  }

  /**
   * Manually add credits (for testing or offline mode)
   */
  addCredits(amount) {
    const credits = this.loadCredits();
    credits.total += amount;
    credits.remaining = credits.total - credits.used;
    this.saveCredits(credits);
    return credits;
  }

  /**
   * Reset all credits and sessions (for testing)
   */
  reset() {
    const credits = {
      total: 0,
      used: 0,
      remaining: 0,
      lastSynced: null,
      syncedWithServer: false
    };
    
    const sessions = {
      sessions: [],
      totalTimeSeconds: 0
    };

    this.saveCredits(credits);
    this.saveSessions(sessions);
    this.activeSession = null;

    return { success: true };
  }
}

module.exports = CreditsManager;
