window.HelioScout = window.HelioScout || {};

/**
 * Data fetching layer for HelioScout.
 * Talks to the Node.js backend; the URL is resolved by js/config.js
 * (loaded first) so deployment is a single config change.
 */
HelioScout.API = (function() {
    const cache = new Map();
    let currentAbortController = null;

    // Resolved by js/config.js (?api= override -> injected -> localhost -> prod fallback)
    const BACKEND_URL = (window.HELIOSCOUT_CONFIG && window.HELIOSCOUT_CONFIG.BACKEND_URL) || 'http://localhost:3000';

    const getCacheKey = (lat, lon) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

    function updateLoadingSource(id, state) {
        const el = document.getElementById(`load-${id}`);
        if (el) {
            el.className = `loading-source ${state}`;
        }
    }

    return {
        /**
         * Fetch full assessment from the backend
         * @param {number} lat 
         * @param {number} lon 
         * @returns {Promise<Object>} The fully assessed data object
         */
        async fetchAllData(lat, lon) {
            const cacheKey = getCacheKey(lat, lon);
            
            if (cache.has(cacheKey)) {
                console.log(`Using cached data for ${cacheKey}`);
                return cache.get(cacheKey);
            }

            if (currentAbortController) {
                currentAbortController.abort();
            }
            
            currentAbortController = new AbortController();
            const signal = currentAbortController.signal;

            // Show loading UI
            document.getElementById('assessment-loading').classList.remove('hidden');
            document.getElementById('assessment-content').classList.add('hidden');
            document.getElementById('assessment-panel').classList.remove('hidden');

            try {
                // The backend fetches all sources in one request; we can't observe
                // them individually mid-flight, so show all three as in-flight.
                updateLoadingSource('nasa', 'loading');
                updateLoadingSource('pvgis', 'loading');
                updateLoadingSource('meteo', 'loading');

                const response = await fetch(`${BACKEND_URL}/api/assess?lat=${lat}&lon=${lon}`, { signal });

                if (!response.ok) {
                    let details = '';
                    try {
                        const errBody = await response.json();
                        details = errBody && errBody.error ? ` (${errBody.error})` : '';
                    } catch (e) {
                        // Non-JSON error body; keep status-only fallback.
                    }
                    throw new Error(`Backend error: ${response.status}${details}`);
                }

                const assessment = await response.json();

                // Reflect the REAL per-source status the backend reports in
                // provenance.status. 'ok' -> loaded; unavailable -> error.
                const status = (assessment.provenance && assessment.provenance.status) || {};
                ['nasa', 'pvgis', 'meteo'].forEach(src => {
                    updateLoadingSource(src, status[src] === 'ok' ? 'loaded' : 'error');
                });

                // Store in cache
                cache.set(cacheKey, assessment);

                return assessment;
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.log('Fetch aborted for new click');
                    return null; // Silent abort
                }
                
                updateLoadingSource('nasa', 'error');
                updateLoadingSource('pvgis', 'error');
                updateLoadingSource('meteo', 'error');
                console.error('Failed to fetch from backend:', error);
                alert('Could not fetch assessment data from the backend. Make sure the Railway server is running.');
                return null;
            }
        },

        /**
         * Reverse geocode a coordinate via the backend proxy (Nominatim is
         * called server-side with proper attribution). Returns a place name or
         * null when unresolved — callers must label null honestly.
         */
        async reverseGeocode(lat, lon) {
            try {
                const res = await fetch(`${BACKEND_URL}/api/geocode/reverse?lat=${lat}&lon=${lon}`);
                if (!res.ok) return null;
                const data = await res.json();
                return data.name || null;
            } catch (e) {
                console.warn('Reverse geocode failed:', e);
                return null;
            }
        },

        /** Forward geocode (search) via the backend proxy. Returns an array of results. */
        async searchPlace(query) {
            try {
                const res = await fetch(`${BACKEND_URL}/api/geocode/search?q=${encodeURIComponent(query)}`);
                if (!res.ok) return [];
                const data = await res.json();
                return data.results || [];
            } catch (e) {
                console.warn('Geocode search failed:', e);
                return [];
            }
        },

        clearCache() {
            cache.clear();
            console.log('API cache cleared');
        }
    };
})();
