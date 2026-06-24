window.RenewMap = window.RenewMap || {};

/**
 * Data fetching layer for Renewable Energy Map Tool
 * Communicates with our Node.js backend hosted on Railway
 */
RenewMap.API = (function() {
    const cache = new Map();
    let currentAbortController = null;

    // In production (Vercel), this will point to the Railway URL.
    // In development, it points to localhost.
    // Replace the production URL once Railway gives you the live URL.
    const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000' 
        : 'https://your-railway-app-name.up.railway.app'; // <--- Update this after deploying to Railway

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
                // We fake the individual loading indicators for UX since the backend does it all in one go
                updateLoadingSource('nasa', 'loading');
                updateLoadingSource('pvgis', 'loading');
                updateLoadingSource('meteo', 'loading');

                const response = await fetch(`${BACKEND_URL}/api/assess?lat=${lat}&lon=${lon}`, { signal });
                
                if (!response.ok) {
                    throw new Error(`Backend error: ${response.status}`);
                }

                const assessment = await response.json();

                updateLoadingSource('nasa', 'loaded');
                updateLoadingSource('pvgis', 'loaded');
                updateLoadingSource('meteo', 'loaded');

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
                throw error;
            }
        },

        clearCache() {
            cache.clear();
            console.log('API cache cleared');
        }
    };
})();
