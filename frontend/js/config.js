/**
 * HelioScout runtime configuration.
 * Loaded before every other module so window.HELIOSCOUT_CONFIG is always available.
 *
 * BACKEND_URL resolution order:
 *   1. ?api=<url>           — query-string override (handy for testing a deployed backend)
 *   2. window.__BACKEND_URL — injected at build time from the Vercel `BACKEND_URL`
 *                             env var (see js/env.js + scripts/generate-env.js).
 *                             This is the source of truth in production.
 *   3. localhost default    — http://localhost:3000 when served locally
 *
 * The backend URL is PUBLIC config. Secret keys (proprietary APIs, tokens) must
 * NEVER be set as Vercel/front-end env vars — they belong in the backend's
 * environment (Railway), where the server uses them and proxies the request.
 */
(function () {
    function resolveBackendUrl() {
        // 1. Query-string override
        try {
            var params = new URLSearchParams(window.location.search);
            var apiOverride = params.get('api');
            if (apiOverride) return apiOverride.replace(/\/$/, '');
        } catch (e) { /* URLSearchParams unsupported — ignore */ }

        // 2. Build-time injected value (Vercel BACKEND_URL -> js/env.js)
        if (typeof window.__BACKEND_URL === 'string' && window.__BACKEND_URL) {
            return window.__BACKEND_URL.replace(/\/$/, '');
        }

        // 3. Localhost default (local dev)
        var host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1' || host === '') {
            return 'http://localhost:3000';
        }

        // No URL resolved — misconfiguration (env var not set at build time).
        return '';
    }

    window.HELIOSCOUT_CONFIG = {
        BACKEND_URL: resolveBackendUrl()
    };

    if (!window.HELIOSCOUT_CONFIG.BACKEND_URL) {
        console.warn('[HelioScout] No BACKEND_URL configured. Set the BACKEND_URL env var ' +
            'in the Vercel project (injected via js/env.js at build), or pass ?api=<url>.');
    } else {
        console.log('[HelioScout] Backend:', window.HELIOSCOUT_CONFIG.BACKEND_URL);
    }
})();
