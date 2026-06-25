#!/usr/bin/env node
/**
 * generate-wind-grid.js
 * ---------------------
 * Builds the gridded 100 m wind-speed field that powers the Global-Wind-Atlas-
 * style raster overlay (see js/wind-overlay.js). Sibling of generate-ghi-grid.js.
 *
 * Primary source: NASA POWER climatology (WS10M & WS50M, annual mean) — the SAME
 * dataset and the SAME shear extrapolation the per-point wind assessment uses:
 *   α   = ln(v50 / v10) / ln(50/10)        (local shear exponent)
 *   v100 = v50 · (100/50)^α                (power-law extrapolation to hub height)
 * If the network is unavailable it falls back to a smooth analytic field anchored
 * to Libya's wind climatology; the source used is recorded in the output.
 *
 * Output: frontend/data/libya-wind.json  (same grid schema as libya-ghi.json,
 * with the values under `wind` in m/s at 100 m).
 *
 * Regenerate:  node scripts/generate-wind-grid.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Libya bounding box — identical to the solar grid for overlay consistency.
const LAT_MIN = 19.0, LAT_MAX = 34.0;
const LON_MIN = 9.0,  LON_MAX = 26.0;
const STEP = 1.0; // degrees — NASA POWER's regional climatology serves a 1° grid

const OUT = path.join(__dirname, '..', 'data', 'libya-wind.json');

function httpGetJSON(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: 30000 }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(e); }
            });
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', reject);
    });
}

const nLat = Math.round((LAT_MAX - LAT_MIN) / STEP) + 1;
const nLon = Math.round((LON_MAX - LON_MIN) / STEP) + 1;

const idx = (row, col) => row * nLon + col;
const rowFor = (lat) => Math.round((LAT_MAX - lat) / STEP);
const colFor = (lon) => Math.round((lon - LON_MIN) / STEP);

/** Power-law extrapolation of 10/50 m winds to the 100 m hub (matches assessment). */
function hubWind(v10, v50) {
    if (!(v10 > 0) || !(v50 > 0)) return null;
    let alpha = Math.log(v50 / v10) / Math.log(5); // ln(50/10)
    alpha = Math.max(0.0, Math.min(0.5, alpha));   // guard against noisy extremes
    return v50 * Math.pow(2, alpha);               // (100/50)^alpha
}

/**
 * Smooth analytic 100 m wind field (m/s) anchored to Libya climatology:
 * windier along the Mediterranean coast and the open southern desert, calmer
 * across the central interior. Used only when NASA POWER is unreachable.
 */
function analyticWind(lat, lon) {
    let w = 5.4;
    w += Math.max(0, lat - 31) * 0.5;                 // coastal/northern boost
    w += Math.max(0, 22 - lat) * 0.06;                // open southern desert
    w -= Math.exp(-Math.pow((lat - 27) / 4, 2)) * 0.9; // calmer central belt
    w += Math.sin((lon - 13) * 0.25) * 0.25;          // gentle longitudinal texture
    return Math.max(3.0, Math.min(9.0, w));
}

function buildAnalytic() {
    const wind = new Array(nLat * nLon);
    for (let r = 0; r < nLat; r++) {
        const lat = LAT_MAX - r * STEP;
        for (let c = 0; c < nLon; c++) {
            wind[idx(r, c)] = +analyticWind(lat, LON_MIN + c * STEP).toFixed(3);
        }
    }
    return wind;
}

/** Fetch one parameter's annual-mean field as a map keyed by "lat,lon". */
async function fetchParam(param) {
    const BLOCK = 5; // degrees per request (within POWER regional limits)
    const out = new Map();
    for (let la = LAT_MIN; la < LAT_MAX; la += BLOCK) {
        for (let lo = LON_MIN; lo < LON_MAX; lo += BLOCK) {
            const la2 = Math.min(la + BLOCK, LAT_MAX);
            const lo2 = Math.min(lo + BLOCK, LON_MAX);
            const url = 'https://power.larc.nasa.gov/api/temporal/climatology/regional'
                + `?parameters=${param}&community=RE&format=JSON`
                + `&latitude-min=${la}&latitude-max=${la2}`
                + `&longitude-min=${lo}&longitude-max=${lo2}`;
            const data = await httpGetJSON(url);
            const feats = data.features || [];
            for (const f of feats) {
                const [lon, lat] = f.geometry.coordinates;
                const v = f.properties?.parameter?.[param]?.ANN;
                if (v != null && v >= 0) out.set(`${lat},${lon}`, { lat, lon, v });
            }
            process.stderr.write(`  ${param}: block lat[${la},${la2}] lon[${lo},${lo2}] → ${feats.length} pts\n`);
        }
    }
    return out;
}

async function fetchNASA() {
    // The regional endpoint allows only one parameter per request, so fetch the
    // two wind heights separately and merge them at each shared MERRA-2 point.
    const [w10, w50] = await Promise.all([fetchParam('WS10M'), fetchParam('WS50M')]);

    // Snap merged hub-height winds onto the output grid, averaging any native
    // points that fall in the same cell.
    const sum = new Array(nLat * nLon).fill(0);
    const cnt = new Array(nLat * nLon).fill(0);
    for (const [key, a] of w50) {
        const b = w10.get(key);
        if (!b) continue;
        const v100 = hubWind(b.v, a.v);
        if (v100 == null) continue;
        const r = rowFor(a.lat), c = colFor(a.lon);
        if (r >= 0 && r < nLat && c >= 0 && c < nLon) {
            sum[idx(r, c)] += v100;
            cnt[idx(r, c)] += 1;
        }
    }

    const wind = new Array(nLat * nLon).fill(null);
    for (let i = 0; i < wind.length; i++) {
        if (cnt[i] > 0) wind[i] = +(sum[i] / cnt[i]).toFixed(3);
    }

    let gaps = 0;
    for (let r = 0; r < nLat; r++) {
        for (let c = 0; c < nLon; c++) {
            if (wind[idx(r, c)] == null) {
                wind[idx(r, c)] = +analyticWind(LAT_MAX - r * STEP, LON_MIN + c * STEP).toFixed(3);
                gaps++;
            }
        }
    }
    if (gaps) process.stderr.write(`  filled ${gaps} edge gaps from analytic model\n`);
    return wind;
}

(async () => {
    let wind, source;
    try {
        process.stderr.write('Fetching NASA POWER regional wind climatology (WS10M, WS50M)…\n');
        wind = await fetchNASA();
        source = 'NASA POWER climatology (WS10M/WS50M → 100 m via power-law shear)';
    } catch (err) {
        process.stderr.write(`NASA POWER fetch failed (${err.message}); using analytic fallback.\n`);
        wind = buildAnalytic();
        source = 'Synthetic analytic model (Libya wind climatology, network unavailable)';
    }

    const out = {
        parameter: 'WS100M_DERIVED',
        description: 'Mean wind speed at 100 m hub height',
        unit: 'm/s',
        source,
        generated: new Date().toISOString().slice(0, 10),
        latMin: LAT_MIN, latMax: LAT_MAX, lonMin: LON_MIN, lonMax: LON_MAX,
        step: STEP, nLat, nLon,
        wind
    };

    fs.writeFileSync(OUT, JSON.stringify(out));
    const min = Math.min(...wind), max = Math.max(...wind);
    process.stderr.write(`Wrote ${OUT}\n  ${nLat}×${nLon} grid, wind ${min.toFixed(2)}–${max.toFixed(2)} m/s\n  source: ${source}\n`);
})();
