const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { fetchAllData } = require('./services/dataFetcher');
const { generateAssessment } = require('./services/scoringEngine');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API Endpoints
app.get('/api/assess', async (req, res) => {
    try {
        const { lat, lon } = req.query;
        
        if (!lat || !lon) {
            return res.status(400).json({ error: 'Latitude and longitude are required.' });
        }

        const latitude = parseFloat(lat);
        const longitude = parseFloat(lon);

        // 1. Fetch data from external APIs (NASA, PVGIS, Open-Meteo)
        const apiData = await fetchAllData(latitude, longitude);

        if (!apiData) {
            return res.status(500).json({ error: 'Failed to fetch data from external APIs.' });
        }

        // 2. Run the assessment engine
        const assessment = generateAssessment(apiData);

        return res.json(assessment);
    } catch (error) {
        console.error('Error during assessment:', error);
        res.status(500).json({ error: 'Internal server error during assessment.' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend is running.' });
});

// Start the server
app.listen(PORT, () => {
    console.log(`RenewMap backend running on port ${PORT}`);
});
