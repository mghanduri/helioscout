/**
 * HelioScout runtime configuration.
 * Loaded before every other module so window.HELIOSCOUT_CONFIG is always available.
 *
 * BACKEND_URL resolution order:
 *   1. ?api=<url>           — query-string override (handy for testing a deployed backend)
 *   2. window.__BACKEND_URL — value injected at deploy time (e.g. by the host/CI)
 *   3. localhost default    — http://localhost:3000 when served locally
 *   4. production fallback   — set PROD_BACKEND_URL below to your deployed backend
 *
 * To deploy: set PROD_BACKEND_URL to your Railway URL (or inject window.__BACKEND_URL).
 */
(function () {
    var PROD_BACKEND_URL = 'https://helioscout-backend-production.up.railway.app';

    function resolveBackendUrl() {
        // 1. Query-string override
        try {
            var params = new URLSearchParams(window.location.search);
            var apiOverride = params.get('api');
            if (apiOverride) return apiOverride.replace(/\/$/, '');
        } catch (e) { /* URLSearchParams unsupported — ignore */ }

        // 2. Deploy-time injected value
        if (typeof window.__BACKEND_URL === 'string' && window.__BACKEND_URL) {
            return window.__BACKEND_URL.replace(/\/$/, '');
        }

        // 3. Localhost default
        var host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1' || host === '') {
            return 'http://localhost:3000';
        }

        // 4. Production fallback
        return PROD_BACKEND_URL.replace(/\/$/, '');
    }

    window.HELIOSCOUT_CONFIG = {
        BACKEND_URL: resolveBackendUrl()
    };

    if (!window.HELIOSCOUT_CONFIG.BACKEND_URL) {
        console.warn('[HelioScout] No BACKEND_URL configured. Set PROD_BACKEND_URL in js/config.js, ' +
            'inject window.__BACKEND_URL, or pass ?api=<url>.');
    } else {
        console.log('[HelioScout] Backend:', window.HELIOSCOUT_CONFIG.BACKEND_URL);
    }
})();
