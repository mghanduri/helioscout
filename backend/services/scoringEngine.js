// NASA POWER climatology keys months as JAN..DEC with ANN for the annual value.
const NASA_MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

// Helper to get annual value
const getAnnual = (nasaParam) => (nasaParam && nasaParam.ANN != null) ? nasaParam.ANN : 0;

// Helper to get monthly array
const getMonthly = (nasaParam) => {
    if (!nasaParam) return Array(12).fill(0);
    return NASA_MONTHS.map(m => nasaParam[m] || 0);
};

function assessSolar(nasaData, pvgisData) {
    if (!nasaData) return null;

    const ghi = { annual: getAnnual(nasaData.ALLSKY_SFC_SW_DWN), monthly: getMonthly(nasaData.ALLSKY_SFC_SW_DWN) };
    const dni = { annual: getAnnual(nasaData.ALLSKY_SFC_SW_DNI), monthly: getMonthly(nasaData.ALLSKY_SFC_SW_DNI) };
    const avgTemp = getAnnual(nasaData.T2M);

    // Warm-season representative temperature for realistic gas-turbine derating.
    // Uses the long-term climatological daily-max (T2M_MAX); falls back to the
    // hottest monthly mean temperature, then to avgTemp + a nominal offset.
    let summerTemp = getAnnual(nasaData.T2M_MAX);
    if (!summerTemp) {
        const monthlyTemps = getMonthly(nasaData.T2M);
        summerTemp = monthlyTemps.length ? Math.max(...monthlyTemps) : avgTemp + 10;
    }

    let pvOutput = null;
    let optimalTilt = null;
    let monthlyProfile = ghi.monthly;

    if (pvgisData && pvgisData.totals) {
        pvOutput = pvgisData.totals.fixed.E_y;
        optimalTilt = pvgisData.totals.fixed.optimal_inclination || 30;
        if (pvgisData.monthly) monthlyProfile = pvgisData.monthly.fixed.map(m => m.E_m);
    } else {
        pvOutput = ghi.annual * 365 * 0.75;
        optimalTilt = 30;
    }

    const capacityFactor = (pvOutput / 8760) * 100;
    let score = 0, rating = '', color = '';

    if (ghi.annual > 6.5) { score = 95; rating = 'Exceptional'; color = '#f59e0b'; }
    else if (ghi.annual > 5.5) { score = 85; rating = 'Excellent'; color = '#fbbf24'; }
    else if (ghi.annual > 4.5) { score = 70; rating = 'Very Good'; color = '#fcd34d'; }
    else if (ghi.annual > 3.5) { score = 55; rating = 'Good'; color = '#10b981'; }
    else if (ghi.annual > 2.5) { score = 40; rating = 'Moderate'; color = '#3b82f6'; }
    else { score = 20; rating = 'Poor'; color = '#64748b'; }

    let tempImpact = 'Low', tempDesc = 'Minimal impact on efficiency';
    if (avgTemp > 25) { score -= 5; tempImpact = 'Moderate'; tempDesc = 'Some efficiency loss in summer'; }
    if (avgTemp > 28) { score -= 5; tempImpact = 'High'; tempDesc = 'Significant heat derating likely'; }

    score = Math.max(0, Math.min(100, score));

    return { ghi, dni, pvOutput, optimalTilt, capacityFactor, monthlyProfile, avgTemp, summerTemp, tempImpact, tempDesc, score, rating, color };
}

function assessWind(nasaData, meteoData) {
    // Primary source: NASA POWER long-term climatology (WS10M / WS50M).
    // We derive the local wind-shear exponent from the 10 m -> 50 m ratio,
    // then extrapolate to 100 m hub height. Open-Meteo (a 14-day forecast) is
    // used only as a cross-check / elevation source, never as the basis for the score.
    let v10 = 0, v50 = 0, v100 = 0;
    let source = 'NASA POWER (long-term climatology)';
    let alpha = 0.143; // default 1/7-power-law exponent

    if (nasaData && getAnnual(nasaData.WS50M)) {
        v10 = getAnnual(nasaData.WS10M);
        v50 = getAnnual(nasaData.WS50M);

        if (v10 > 0 && v50 > 0) {
            // alpha = ln(v50/v10) / ln(50/10)
            const derived = Math.log(v50 / v10) / Math.log(50 / 10);
            if (isFinite(derived)) alpha = Math.max(0.10, Math.min(0.40, derived));
        }
        v100 = v50 * Math.pow(100 / 50, alpha);
    } else if (meteoData && meteoData.wind && meteoData.wind.mean100m) {
        // Fallback only if climatology unavailable
        v10 = meteoData.wind.mean10m;
        v100 = meteoData.wind.mean100m;
        v50 = v100 * Math.pow(50 / 100, alpha);
        source = 'Open-Meteo (short-term, fallback)';
    }

    // Optional cross-check value from Open-Meteo forecast (not used for scoring)
    const crossCheck100m = (meteoData && meteoData.wind) ? meteoData.wind.mean100m : null;

    if (v100 === 0) return null;

    const wpd = 0.5 * 1.225 * Math.pow(v100, 3) * 1.9;
    let estimatedCF = Math.max(0, (0.087 * v100 - 0.22)) * 100;
    if (v100 < 4) estimatedCF = 0;

    let score = 0, rating = '', color = '', windClassDesc = '';

    if (v100 >= 8.5) { score = 95; rating = 'Exceptional'; color = '#0284c7'; windClassDesc = 'IEC Class I (High Wind)'; }
    else if (v100 >= 7.5) { score = 85; rating = 'Excellent'; color = '#06b6d4'; windClassDesc = 'IEC Class II (Medium Wind)'; }
    else if (v100 >= 6.0) { score = 70; rating = 'Very Good'; color = '#22d3ee'; windClassDesc = 'IEC Class III (Low Wind)'; }
    else if (v100 >= 5.0) { score = 50; rating = 'Moderate'; color = '#67e8f9'; windClassDesc = 'IEC Class IV (Very Low Wind)'; }
    else { score = 25; rating = 'Poor'; color = '#64748b'; windClassDesc = 'Below commercial threshold'; }

    return { v10, v50, v100, shearAlpha: alpha, wpd, windClassDesc, estimatedCF, source, crossCheck100m, score, rating, color };
}

function assessCSP(nasaData) {
    if (!nasaData) return null;
    const dniDaily = getAnnual(nasaData.ALLSKY_SFC_SW_DNI);
    const dniAnnual = dniDaily * 365;

    let score = 0, suitability = '', color = '';
    if (dniAnnual >= 2500) { score = 95; suitability = 'Excellent for CSP Tower/Trough'; color = '#f97316'; }
    else if (dniAnnual >= 2000) { score = 75; suitability = 'Good for CSP'; color = '#fb923c'; }
    else if (dniAnnual >= 1800) { score = 50; suitability = 'Marginal (borderline viable)'; color = '#fdba74'; }
    else { score = 20; suitability = 'Not recommended (DNI too low)'; color = '#64748b'; }

    return { dniDaily, dniAnnual, suitability, score, color };
}

module.exports = {
    generateAssessment(apiData) {
        if (!apiData) return null;
        const { lat, lon, nasa, pvgis, meteo } = apiData;

        const solar = assessSolar(nasa, pvgis);
        const wind = assessWind(nasa, meteo);
        const csp = assessCSP(nasa);

        let overallScore = 0;
        if (solar && wind && csp) overallScore = (solar.score * 0.5) + (wind.score * 0.35) + (csp.score * 0.15);
        else if (solar && csp) overallScore = (solar.score * 0.6) + (csp.score * 0.4);
        else if (solar) overallScore = solar.score;
        overallScore = Math.round(overallScore);

        let recommendation = 'Solar PV';
        if (wind && solar && wind.score > solar.score + 10) recommendation = 'Wind Farm';
        else if (wind && solar && wind.score > 70 && solar.score > 70) recommendation = 'Hybrid Solar + Wind';
        else if (csp && csp.score > 90) recommendation = 'Solar PV or CSP Tower';

        return {
            id: `${lat.toFixed(4)},${lon.toFixed(4)}`,
            lat, lon, elevation: meteo?.elevation || 'Unknown',
            solar, wind, csp, overallScore, recommendation,
            timestamp: Date.now()
        };
    }
};
