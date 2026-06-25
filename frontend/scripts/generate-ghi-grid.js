#!/usr/bin/env node
/**
 * generate-ghi-grid.js
 * --------------------
 * Builds the gridded Global Horizontal Irradiance (GHI) field that powers the
 * Global-Solar-Atlas-style raster overlay (see js/solar-overlay.js).
 *
 * Primary source: NASA POWER climatology — the SAME dataset the per-point
 * assessment uses (parameter ALLSKY_SFC_SW_DWN, annual mean, kWh/m²/day).
 * The bounding box is tiled into requests against the POWER `regional`
 * endpoint (0.5° native grid). If the network is unavailable, it falls back to
 * a smooth analytic field anchored to Libya's known GHI range so the build
 * never breaks — the chosen source is recorded in the output for honesty.
 *
 * Output: frontend/data/libya-ghi.json
 *
 *   {
 *     parameter, unit, source, generated,
 *     latMin, latMax, lonMin, lonMax, step, nLat, nLon,
 *     ghi: [ nLat * nLon ]   // row-major, row 0 = north (latMax), col 0 = west (lonMin)
 *   }
 *
 * Regenerate with real data:  node scripts/generate-ghi-grid.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Libya bounding box (a little padding beyond the borders).
const LAT_MIN = 19.0, LAT_MAX = 34.0;
const LON_MIN = 9.0,  LON_MAX = 26.0;
const STEP = 1.0; // degrees — NASA POWER's regional climatology serves a 1° grid

const OUT = path.join(__dirname, '..', 'data', 'libya-ghi.json');

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

// Grid index: row 0 = north. lat(row) = LAT_MAX - row*STEP ; lon(col) = LON_MIN + col*STEP
const idx = (row, col) => row * nLon + col;
const rowFor = (lat) => Math.round((LAT_MAX - lat) / STEP);
const colFor = (lon) => Math.round((lon - LON_MIN) / STEP);

/**
 * Smooth analytic GHI field (kWh/m²/day) anchored to Libya climatology:
 * deep-Sahara south ≈ 6.7–6.9, Mediterranean coast ≈ 5.4–5.8. Captures the
 * dominant N–S gradient plus mild coastal moderation and a gentle E–W trend.
 */
function analyticGHI(lat, lon) {
    let g = 6.95 - (lat - LAT_MIN) * 0.075;          // strong latitude gradient
    const coast = Math.max(0, lat - 30.5);            // Mediterranean influence
    g -= coast * 0.18;                                // cloudier/humid near coast
    g += Math.cos((lon - 17) * 0.18) * 0.12;          // gentle longitudinal texture
    g -= Math.max(0, 31 - lat) > 0 ? 0 : 0;           // (kept explicit for clarity)
    return Math.max(5.0, Math.min(7.0, g));
}

function buildAnalytic() {
    const ghi = new Array(nLat * nLon);
    for (let r = 0; r < nLat; r++) {
        const lat = LAT_MAX - r * STEP;
        for (let c = 0; c < nLon; c++) {
            const lon = LON_MIN + c * STEP;
            ghi[idx(r, c)] = +analyticGHI(lat, lon).toFixed(3);
        }
    }
    return ghi;
}

/**
 * Fetch the real field from NASA POWER. The regional endpoint caps the area
 * per request, so we tile the bbox into ≤5°×5° blocks and stitch them.
 */
async function fetchNASA() {
    const ghi = new Array(nLat * nLon).fill(null);
    const BLOCK = 5; // degrees per request (within POWER regional limits)

    for (let la = LAT_MIN; la < LAT_MAX; la += BLOCK) {
        for (let lo = LON_MIN; lo < LON_MAX; lo += BLOCK) {
            const la2 = Math.min(la + BLOCK, LAT_MAX);
            const lo2 = Math.min(lo + BLOCK, LON_MAX);
            const url = 'https://power.larc.nasa.gov/api/temporal/climatology/regional'
                + '?parameters=ALLSKY_SFC_SW_DWN&community=RE&format=JSON'
                + `&latitude-min=${la}&latitude-max=${la2}`
                + `&longitude-min=${lo}&longitude-max=${lo2}`;

            const data = await httpGetJSON(url);
            const feats = data.features || [];
            for (const f of feats) {
                const [lon, lat] = f.geometry.coordinates;
                const val = f.properties?.parameter?.ALLSKY_SFC_SW_DWN?.ANN;
                if (val == null || val < 0) continue;
                const r = rowFor(lat), c = colFor(lon);
                if (r >= 0 && r < nLat && c >= 0 && c < nLon) {
                    ghi[idx(r, c)] = +val.toFixed(3);
                }
            }
            process.stderr.write(`  fetched block lat[${la},${la2}] lon[${lo},${lo2}] → ${feats.length} pts\n`);
        }
    }

    // Fill any gaps (grid edges that fell between POWER cells) from the analytic field.
    let gaps = 0;
    for (let r = 0; r < nLat; r++) {
        for (let c = 0; c < nLon; c++) {
            if (ghi[idx(r, c)] == null) {
                ghi[idx(r, c)] = +analyticGHI(LAT_MAX - r * STEP, LON_MIN + c * STEP).toFixed(3);
                gaps++;
            }
        }
    }
    if (gaps) process.stderr.write(`  filled ${gaps} edge gaps from analytic model\n`);
    return ghi;
}

(async () => {
    let ghi, source;
    try {
        process.stderr.write('Fetching NASA POWER regional GHI climatology…\n');
        ghi = await fetchNASA();
        source = 'NASA POWER climatology (ALLSKY_SFC_SW_DWN, annual mean)';
    } catch (err) {
        process.stderr.write(`NASA POWER fetch failed (${err.message}); using analytic fallback.\n`);
        ghi = buildAnalytic();
        source = 'Synthetic analytic model (Libya GHI climatology, network unavailable)';
    }

    const out = {
        parameter: 'ALLSKY_SFC_SW_DWN',
        description: 'Global Horizontal Irradiance, annual mean',
        unit: 'kWh/m2/day',
        source,
        generated: new Date().toISOString().slice(0, 10),
        latMin: LAT_MIN, latMax: LAT_MAX, lonMin: LON_MIN, lonMax: LON_MAX,
        step: STEP, nLat, nLon,
        ghi
    };

    fs.writeFileSync(OUT, JSON.stringify(out));
    const min = Math.min(...ghi), max = Math.max(...ghi);
    process.stderr.write(`Wrote ${OUT}\n  ${nLat}×${nLon} grid, GHI ${min.toFixed(2)}–${max.toFixed(2)} kWh/m²/day\n  source: ${source}\n`);
})();
