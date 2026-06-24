// Helper to get annual value
const getAnnual = (nasaParam) => nasaParam ? nasaParam["13"] : 0;

// Helper to get monthly array
const getMonthly = (nasaParam) => {
    if (!nasaParam) return Array(12).fill(0);
    return [1,2,3,4,5,6,7,8,9,10,11,12].map(m => nasaParam[m.toString()] || 0);
};

function assessSolar(nasaData, pvgisData) {
    if (!nasaData) return null;

    const ghi = { annual: getAnnual(nasaData.ALLSKY_SFC_SW_DWN), monthly: getMonthly(nasaData.ALLSKY_SFC_SW_DWN) };
    const dni = { annual: getAnnual(nasaData.ALLSKY_SFC_SW_DNI), monthly: getMonthly(nasaData.ALLSKY_SFC_SW_DNI) };
    const avgTemp = getAnnual(nasaData.T2M);
    
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

    return { ghi, dni, pvOutput, optimalTilt, capacityFactor, monthlyProfile, avgTemp, tempImpact, tempDesc, score, rating, color };
}

function assessWind(meteoData, nasaData) {
    let v10 = 0, v50 = 0, v80 = 0, v100 = 0;
    
    if (meteoData && meteoData.wind) {
        v10 = meteoData.wind.mean10m; v80 = meteoData.wind.mean80m; v100 = meteoData.wind.mean100m; v50 = (v10 + v80) / 2;
    } else if (nasaData) {
        v10 = getAnnual(nasaData.WS10M); v50 = getAnnual(nasaData.WS50M); v100 = v50 * Math.pow((100/50), 0.143);
    }

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

    return { v10, v50, v80, v100, wpd, windClassDesc, estimatedCF, score, rating, color };
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

function assessGeothermal(lat, lon) {
    let indicator = 'Very Low', score = 10, description = 'No known significant geothermal resources in this area.';
    if (lat > 34 || (lat > 30 && lon < 10)) {
        indicator = 'Low/Moderate'; score = 30; description = 'Potential for low-enthalpy direct use or binary cycle.';
    }
    return { indicator, score, description };
}

module.exports = {
    generateAssessment(apiData) {
        if (!apiData) return null;
        const { lat, lon, nasa, pvgis, meteo } = apiData;

        const solar = assessSolar(nasa, pvgis);
        const wind = assessWind(meteo, nasa);
        const csp = assessCSP(nasa);
        const geo = assessGeothermal(lat, lon);

        let overallScore = 0;
        if (solar && wind && csp) overallScore = (solar.score * 0.5) + (wind.score * 0.35) + (csp.score * 0.15);
        overallScore = Math.round(overallScore);

        let recommendation = 'Solar PV';
        if (wind && wind.score > solar.score + 10) recommendation = 'Wind Farm';
        else if (wind && wind.score > 70 && solar.score > 70) recommendation = 'Hybrid Solar + Wind';
        else if (csp && csp.score > 90) recommendation = 'Solar PV or CSP Tower';

        return {
            id: `${lat.toFixed(4)},${lon.toFixed(4)}`,
            lat, lon, elevation: meteo?.elevation || 'Unknown',
            solar, wind, csp, geo, overallScore, recommendation,
            timestamp: Date.now()
        };
    }
};
