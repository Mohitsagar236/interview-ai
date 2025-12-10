// Vercel Web Analytics Initialization
// This script initializes Vercel Web Analytics for the Interview AI application

(function() {
  // Import and inject Vercel Analytics
  // Note: @vercel/analytics must be available as a client-side dependency
  if (typeof window !== 'undefined') {
    try {
      // Dynamically import the analytics module
      import('@vercel/analytics').then(function(module) {
        if (module && typeof module.inject === 'function') {
          console.log('[Analytics] Initializing Vercel Web Analytics');
          module.inject();
          console.log('[Analytics] Vercel Web Analytics initialized successfully');
        } else {
          console.warn('[Analytics] Unable to initialize Vercel Web Analytics: inject function not found');
        }
      }).catch(function(error) {
        console.warn('[Analytics] Failed to import Vercel Analytics:', error.message);
      });
    } catch (error) {
      console.warn('[Analytics] Error initializing Vercel Analytics:', error.message);
    }
  }
})();
