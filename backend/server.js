const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const { fetchAllData } = require('./services/dataFetcher');
const { generateAssessment } = require('./services/scoringEngine');
const authRoutes = require('./routes/auth');
const meRoutes = require('./routes/me');

// Identify the application to Nominatim per its usage policy (a real contact /
// app identifier is required for server-side use).
const NOMINATIM_UA = 'HelioScout/1.0 (renewable siting tool; contact: ops@helioscout)';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

function parseCoordinate(value, kind) {
    const n = Number(value);
    if (!Number.isFinite(n)) return { ok: false, error: `${kind} must be a finite number.` };
    if (kind === 'Latitude' && (n < -90 || n > 90)) {
        return { ok: false, error: 'Latitude must be between -90 and 90.' };
    }
    if (kind === 'Longitude' && (n < -180 || n > 180)) {
        return { ok: false, error: 'Longitude must be between -180 and 180.' };
    }
    return { ok: true, value: n };
}

// Middleware
app.use(cors());
app.use(express.json());

// Account + per-user personalization (SQLite-backed)
app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);

// API Endpoints
app.get('/api/assess', async (req, res) => {
    try {
        const { lat, lon } = req.query;
        
        if (lat == null || lon == null) {
            return res.status(400).json({ error: 'Latitude and longitude are required.' });
        }

        const parsedLat = parseCoordinate(lat, 'Latitude');
        if (!parsedLat.ok) return res.status(400).json({ error: parsedLat.error });
        const parsedLon = parseCoordinate(lon, 'Longitude');
        if (!parsedLon.ok) return res.status(400).json({ error: parsedLon.error });
        const latitude = parsedLat.value;
        const longitude = parsedLon.value;

        // 1. Fetch data from external APIs (NASA, PVGIS, Open-Meteo)
        const apiData = await fetchAllData(latitude, longitude);

        if (!apiData) {
            return res.status(500).json({ error: 'Failed to fetch data from external APIs.' });
        }
        if (!apiData.nasa) {
            // Core annual resource climatology is required for the assessment.
            return res.status(503).json({
                error: 'Core climatology data is temporarily unavailable. Please retry shortly.'
            });
        }

        // 2. Run the assessment engine
        const assessment = generateAssessment(apiData);

        return res.json(assessment);
    } catch (error) {
        console.error('Error during assessment:', error);
        res.status(500).json({ error: 'Internal server error during assessment.' });
    }
});

// Reverse geocode proxy — resolves a place name for a coordinate via Nominatim
// server-side (proper attribution, honest fallback). Replaces the previous
// browser-direct call that violated Nominatim's usage policy at any real volume.
app.get('/api/geocode/reverse', async (req, res) => {
    const { lat, lon } = req.query;
    if (lat == null || lon == null) {
        return res.status(400).json({ error: 'Latitude and longitude are required.' });
    }
    const parsedLat = parseCoordinate(lat, 'Latitude');
    if (!parsedLat.ok) return res.status(400).json({ error: parsedLat.error });
    const parsedLon = parseCoordinate(lon, 'Longitude');
    if (!parsedLon.ok) return res.status(400).json({ error: parsedLon.error });
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(parsedLat.value)}&lon=${encodeURIComponent(parsedLon.value)}&zoom=10`;
        const r = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': NOMINATIM_UA } });
        const d = r.data || {};
        const a = d.address || {};
        const name = d.name || a.city || a.town || a.village || a.state || null;
        // Honest: null when unresolved, so the frontend can label it truthfully
        // rather than fabricating a name.
        return res.json({ name, raw: { displayName: d.display_name || null } });
    } catch (error) {
        console.warn('Reverse geocode failed:', error.message);
        return res.json({ name: null, error: 'geocode_unavailable' });
    }
});

// Forward geocode (search) proxy — used by the map search box.
app.get('/api/geocode/search', async (req, res) => {
    const { q } = req.query;
    if (!q || !String(q).trim()) {
        return res.status(400).json({ error: 'A search query (q) is required.' });
    }
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`;
        const r = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': NOMINATIM_UA } });
        const results = (r.data || []).map(item => ({
            displayName: item.display_name,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon)
        }));
        return res.json({ results });
    } catch (error) {
        console.warn('Geocode search failed:', error.message);
        return res.json({ results: [], error: 'geocode_unavailable' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend is running.' });
});

// Start the server
app.listen(PORT, () => {
    console.log(`HelioScout backend running on port ${PORT}`);
});
