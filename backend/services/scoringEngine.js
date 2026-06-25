// NASA POWER climatology keys months as JAN..DEC with ANN for the annual value.
const NASA_MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

// All scoring thresholds/bands/weights come from the dated, sourced assumptions
// register — not hardcoded here. See assumptions.json (scoring section).
const { assumptions, bandLookup } = require('./assumptions');
const S = assumptions.scoring;

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
        // Fallback PV yield from NASA GHI when PVGIS is unavailable / out of coverage.
        pvOutput = ghi.annual * 365 * S.pvFallbackEfficiency;
        optimalTilt = 30;
    }

    const capacityFactor = (pvOutput / 8760) * 100;

    // GHI band score (solar bands use strict greater-than).
    const band = bandLookup(ghi.annual, S.solarGHIBands, false);
    let score = band.score;
    const rating = band.rating;
    const color = band.color;

    let tempImpact = 'Low', tempDesc = 'Minimal impact on efficiency';
    if (avgTemp > S.tempImpact.moderateC) { score -= S.tempImpact.penalty; tempImpact = 'Moderate'; tempDesc = 'Some efficiency loss in summer'; }
    if (avgTemp > S.tempImpact.highC)     { score -= S.tempImpact.penalty; tempImpact = 'High';     tempDesc = 'Significant heat derating likely'; }

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
    let alpha = S.shear.default; // default power-law exponent

    if (nasaData && getAnnual(nasaData.WS50M)) {
        v10 = getAnnual(nasaData.WS10M);
        v50 = getAnnual(nasaData.WS50M);

        if (v10 > 0 && v50 > 0) {
            // alpha = ln(v50/v10) / ln(50/10)
            const derived = Math.log(v50 / v10) / Math.log(50 / 10);
            if (isFinite(derived)) alpha = Math.max(S.shear.min, Math.min(S.shear.max, derived));
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

    // Hub-height speed band score (wind bands use >=, mapped to IEC classes).
    const band = bandLookup(v100, S.windV100Bands, true);
    const score = band.score;
    const rating = band.rating;
    const color = band.color;
    const windClassDesc = band.iec;

    return { v10, v50, v100, shearAlpha: alpha, wpd, windClassDesc, estimatedCF, source, crossCheck100m, score, rating, color };
}

function assessCSP(nasaData) {
    if (!nasaData) return null;
    const dniDaily = getAnnual(nasaData.ALLSKY_SFC_SW_DNI);
    const dniAnnual = dniDaily * 365;

    // Annual DNI viability band (CSP bands use >=).
    const band = bandLookup(dniAnnual, S.cspDNIBands, true);
    const score = band.score;
    const suitability = band.suitability;
    const color = band.color;

    return { dniDaily, dniAnnual, suitability, score, color };
}

module.exports = {
    generateAssessment(apiData) {
        if (!apiData) return null;
        const { lat, lon, nasa, pvgis, meteo } = apiData;

        const solar = assessSolar(nasa, pvgis);
        const wind = assessWind(nasa, meteo);
        const csp = assessCSP(nasa);

        const w = S.overallWeights;
        const wnw = S.overallWeightsNoWind;
        let overallScore = 0;
        if (solar && wind && csp) overallScore = (solar.score * w.solar) + (wind.score * w.wind) + (csp.score * w.csp);
        else if (solar && csp) overallScore = (solar.score * wnw.solar) + (csp.score * wnw.csp);
        else if (solar) overallScore = solar.score;
        overallScore = Math.round(overallScore);

        const rec = S.recommendation;
        let recommendation = 'Solar PV';
        if (wind && solar && wind.score > solar.score + rec.windMarginOverSolar) recommendation = 'Wind Farm';
        else if (wind && solar && wind.score > rec.hybridMinScore && solar.score > rec.hybridMinScore) recommendation = 'Hybrid Solar + Wind';
        else if (csp && csp.score > rec.cspExcellentMin) recommendation = 'Solar PV or CSP Tower';

        const timestamp = apiData.timestamp || Date.now();
        const meta = apiData.meta || {};
        const pvgisOk = !!(pvgis && pvgis.totals);

        // On-screen provenance: every metric traces to a named dataset/version,
        // an as-of date, and (for scores) the documented threshold basis. This is
        // also the honest, real per-source status the frontend reflects — no
        // faked telemetry.
        const provenance = {
            retrievedAt: new Date(timestamp).toISOString(),
            assumptionsVersion: assumptions.meta.version,
            assumptionsUpdated: assumptions.meta.updated,
            status: {
                nasa: nasa ? 'ok' : 'unavailable',
                pvgis: pvgisOk ? 'ok' : 'unavailable',
                meteo: meteo ? 'ok' : 'unavailable'
            },
            datasets: {
                solar: {
                    resource: meta.nasa || { name: 'NASA POWER', dataset: 'Climatology' },
                    pvYield: pvgisOk
                        ? (meta.pvgis || { name: 'EU PVGIS', version: 'v5.3' })
                        : { name: 'Fallback', dataset: `NASA GHI × 365 × ${S.pvFallbackEfficiency} (PVGIS unavailable / out of coverage)` }
                },
                wind: {
                    resource: wind ? { name: 'NASA POWER', dataset: 'Climatology (WS10M/WS50M, derived shear → 100 m)', source: wind.source } : null,
                    crossCheck: meta.meteo || { name: 'Open-Meteo', role: 'cross-check / elevation' }
                },
                csp: { resource: meta.nasa || { name: 'NASA POWER', dataset: 'Annual DNI (daily × 365)' } }
            },
            thresholdBasis: S._basis
        };

        return {
            id: `${lat.toFixed(4)},${lon.toFixed(4)}`,
            lat, lon, elevation: meteo?.elevation || 'Unknown',
            solar, wind, csp, overallScore, recommendation,
            provenance,
            timestamp
        };
    }
};
