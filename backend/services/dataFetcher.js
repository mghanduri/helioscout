const axios = require('axios');

async function fetchNASAPowerData(lat, lon) {
    const params = [
        'ALLSKY_SFC_SW_DWN', 'ALLSKY_SFC_SW_DNI', 'ALLSKY_SFC_SW_DIFF', 
        'CLRSKY_SFC_SW_DWN', 'WS10M', 'WS50M', 'T2M', 'T2M_MAX', 'T2M_MIN', 'PRECTOTCORR'
    ].join(',');

    const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?latitude=${lat}&longitude=${lon}&parameters=${params}&community=RE&format=JSON`;

    try {
        const response = await axios.get(url, { timeout: 10000 });
        return response.data.properties?.parameter || null;
    } catch (error) {
        console.error('NASA POWER fetch failed:', error.message);
        return null;
    }
}

async function fetchPVGISData(lat, lon) {
    const url = `https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=${lat}&lon=${lon}&peakpower=1&loss=14&outputformat=json`;

    try {
        const response = await axios.get(url, { timeout: 10000 });
        return response.data.outputs || null;
    } catch (error) {
        console.warn(`PVGIS fetch failed (likely outside coverage):`, error.message);
        return null;
    }
}

async function fetchOpenMeteoWind(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_speed_80m,wind_speed_100m,wind_speed_120m,wind_direction_100m&wind_speed_unit=ms&forecast_days=14`;

    try {
        const response = await axios.get(url, { timeout: 10000 });
        const data = response.data;
        
        const hourly = data.hourly;
        const mean10m = calculateMean(hourly.wind_speed_10m);
        const mean80m = calculateMean(hourly.wind_speed_80m);
        const mean100m = calculateMean(hourly.wind_speed_100m);
        const mean120m = calculateMean(hourly.wind_speed_120m);
        
        return {
            elevation: data.elevation,
            wind: { mean10m, mean80m, mean100m, mean120m, hourly }
        };
    } catch (error) {
        console.error('Open-Meteo fetch failed:', error.message);
        return null;
    }
}

function calculateMean(arr) {
    if (!arr || !arr.length) return 0;
    const valid = arr.filter(v => v !== null);
    if (!valid.length) return 0;
    const sum = valid.reduce((a, b) => a + b, 0);
    return sum / valid.length;
}

module.exports = {
    async fetchAllData(lat, lon) {
        const [nasa, pvgis, meteo] = await Promise.all([
            fetchNASAPowerData(lat, lon),
            fetchPVGISData(lat, lon),
            fetchOpenMeteoWind(lat, lon)
        ]);

        return { lat, lon, nasa, pvgis, meteo, timestamp: Date.now() };
    }
};
