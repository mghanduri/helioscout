#!/usr/bin/env node
/**
 * generate-transmission.js
 * ------------------------
 * Builds the GeoJSON FeatureCollection of Libya's existing high-voltage
 * transmission network that powers the "Transmission Network" map layer
 * (see js/transmission.js) and the grid-connection economics.
 *
 * Primary source: OpenStreetMap, queried live through the Overpass API for
 * `power=line` / `power=cable` ways and `power=substation` nodes/ways inside
 * the Libya bounding box. OSM ways are resolved to coordinate geometry and
 * emitted as GeoJSON LineStrings carrying their `voltage` tag.
 *
 * If Overpass is unavailable, it falls back to a curated 220/400 kV GECOL
 * backbone (the coastal ring + the Sabha/Fezzan southern radial) plus the
 * principal substations, so the build never breaks. The chosen source is
 * recorded in the output for honesty — the same convention as the GHI grid.
 *
 * Output: frontend/data/libya-transmission.json  (GeoJSON FeatureCollection)
 *
 * Regenerate with real data:  node scripts/generate-transmission.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Libya bounding box (matches the GHI/wind grids).
const LAT_MIN = 19.0, LAT_MAX = 34.0;
const LON_MIN = 9.0,  LON_MAX = 26.0;

const OUT = path.join(__dirname, '..', 'data', 'libya-transmission.json');

// Transmission threshold (kV). Below this is sub-transmission/distribution and
// is excluded so the layer shows a clean, defensible HV network where every
// rendered line carries a known, priceable voltage.
const VOLTAGE_FLOOR_KV = 60;

// A few public Overpass mirrors — tried in order until one answers.
const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];

function httpPost(url, body) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const data = 'data=' + encodeURIComponent(body);
        const req = https.request({
            hostname: u.hostname,
            path: u.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(data),
                'User-Agent': 'HelioScout/1.0 (transmission grid generator)'
            },
            timeout: 180000
        }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            let buf = '';
            res.on('data', (c) => (buf += c));
            res.on('end', () => {
                try { resolve(JSON.parse(buf)); }
                catch (e) { reject(e); }
            });
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

/** Parse the first integer kV value out of an OSM `voltage` tag (e.g. "220000;66000" → 220). */
function parseVoltageKV(tag) {
    if (!tag) return null;
    const first = String(tag).split(';')[0].trim();
    const v = parseFloat(first);
    if (!isFinite(v) || v <= 0) return null;
    return Math.round(v / 1000); // volts → kV
}

/**
 * Overpass QL: HV power lines/cables and substations within the bbox.
 * `out geom;` returns inline node geometry on ways so we don't need a second pass.
 */
function overpassQuery() {
    const bbox = `${LAT_MIN},${LON_MIN},${LAT_MAX},${LON_MAX}`;
    return `[out:json][timeout:170];
(
  way["power"="line"](${bbox});
  way["power"="cable"](${bbox});
  way["power"="substation"](${bbox});
  node["power"="substation"](${bbox});
);
out geom;`;
}

async function fetchOSM() {
    let data = null, lastErr = null;
    for (const ep of OVERPASS_ENDPOINTS) {
        try {
            process.stderr.write(`Querying Overpass: ${ep}\n`);
            data = await httpPost(ep, overpassQuery());
            break;
        } catch (e) {
            lastErr = e;
            process.stderr.write(`  ${ep} failed (${e.message})\n`);
        }
    }
    if (!data) throw lastErr || new Error('all Overpass endpoints failed');

    const features = [];
    let lines = 0, subs = 0;

    for (const el of (data.elements || [])) {
        const tags = el.tags || {};

        if (el.type === 'way' && (tags.power === 'line' || tags.power === 'cable') && Array.isArray(el.geometry)) {
            const kv = parseVoltageKV(tags.voltage);
            // Keep only confirmed transmission-level lines (known voltage ≥ floor).
            if (kv == null || kv < VOLTAGE_FLOOR_KV) continue;
            const coords = el.geometry.map((g) => [+g.lon.toFixed(4), +g.lat.toFixed(4)]);
            if (coords.length < 2) continue;
            features.push({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: coords },
                properties: {
                    kind: 'line',
                    voltage: kv,
                    name: tags.name || tags['name:en'] || null,
                    operator: tags.operator || null,
                    cables: tags.cables ? parseInt(tags.cables, 10) : null,
                    osmId: `way/${el.id}`
                }
            });
            lines++;
        } else if (tags.power === 'substation') {
            const kv = parseVoltageKV(tags.voltage);
            // Only transmission substations — these are the credible grid
            // connection nodes; distribution substations would swamp the map.
            if (kv == null || kv < VOLTAGE_FLOOR_KV) continue;
            // Represent substations as a point (way → centroid of its geometry).
            let lat = el.lat, lon = el.lon;
            if (lat == null && Array.isArray(el.geometry) && el.geometry.length) {
                lat = el.geometry.reduce((s, g) => s + g.lat, 0) / el.geometry.length;
                lon = el.geometry.reduce((s, g) => s + g.lon, 0) / el.geometry.length;
            }
            if (lat == null || lon == null) continue;
            features.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [+lon.toFixed(4), +lat.toFixed(4)] },
                properties: {
                    kind: 'substation',
                    voltage: kv,
                    name: tags.name || tags['name:en'] || null,
                    operator: tags.operator || null,
                    osmId: `${el.type}/${el.id}`
                }
            });
            subs++;
        }
    }

    if (lines === 0) throw new Error('Overpass returned no power lines');
    process.stderr.write(`  parsed ${lines} line segments, ${subs} substations\n`);
    return { features, lines, subs };
}

/**
 * Curated fallback: Libya's GECOL HV backbone. Coordinates trace the coastal
 * 220/400 kV ring through the main load centres plus the southern radial to
 * Sabha. Approximate but topologically faithful for connection-distance math.
 */
function buildCuratedBackbone() {
    // [name, kV, [[lon,lat], …]]
    const lines = [
        ['West coastal corridor (Zuwara–Tripoli–Misrata)', 220, [
            [11.95, 32.93], [12.71, 32.88], [13.18, 32.89], [13.33, 32.76],
            [13.91, 32.66], [14.28, 32.49], [14.79, 32.42], [15.09, 32.38]
        ]],
        ['Central coastal corridor (Misrata–Sirte–Ajdabiya)', 220, [
            [15.09, 32.38], [15.79, 31.71], [16.59, 31.20], [17.50, 30.80],
            [18.55, 30.55], [19.58, 30.18], [20.18, 30.76]
        ]],
        ['East coastal corridor (Ajdabiya–Benghazi–Bayda–Tobruk)', 220, [
            [20.18, 30.76], [20.07, 31.20], [20.07, 32.11], [20.84, 32.49],
            [21.71, 32.77], [21.86, 32.76], [22.64, 32.70], [23.96, 32.08]
        ]],
        ['Southern radial (Sirte–Hun–Sabha)', 220, [
            [16.59, 31.20], [15.94, 29.12], [15.95, 27.66], [14.43, 27.04],
            [14.41, 26.34]
        ]],
        ['Sabha–Ubari spur', 220, [
            [14.41, 26.34], [13.05, 26.59], [12.78, 26.59]
        ]]
    ];
    const substations = [
        ['Tripoli West', 220, [13.18, 32.81]],
        ['Misrata', 220, [15.09, 32.38]],
        ['Sirte', 220, [16.59, 31.20]],
        ['Ajdabiya', 220, [20.18, 30.76]],
        ['Benghazi North', 220, [20.07, 32.11]],
        ['Bayda', 220, [21.75, 32.76]],
        ['Tobruk', 220, [23.96, 32.08]],
        ['Hun', 220, [15.94, 29.12]],
        ['Sabha', 220, [14.41, 26.34]],
        ['Zawiya', 220, [12.71, 32.88]]
    ];

    const features = [];
    for (const [name, kv, coords] of lines) {
        features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
            properties: { kind: 'line', voltage: kv, name, operator: 'GECOL', osmId: null }
        });
    }
    for (const [name, kv, coord] of substations) {
        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: coord },
            properties: { kind: 'substation', voltage: kv, name, operator: 'GECOL', osmId: null }
        });
    }
    return { features, lines: lines.length, subs: substations.length };
}

(async () => {
    let result, source;
    try {
        result = await fetchOSM();
        source = 'OpenStreetMap via Overpass API (power=line/cable/substation)';
    } catch (err) {
        process.stderr.write(`Overpass fetch failed (${err.message}); using curated GECOL backbone.\n`);
        result = buildCuratedBackbone();
        source = 'Curated GECOL 220/400 kV backbone (OSM unavailable)';
    }

    const out = {
        type: 'FeatureCollection',
        description: 'Libya high-voltage transmission network (lines + substations)',
        source,
        generated: new Date().toISOString().slice(0, 10),
        bbox: [LON_MIN, LAT_MIN, LON_MAX, LAT_MAX],
        features: result.features
    };

    fs.writeFileSync(OUT, JSON.stringify(out));
    process.stderr.write(
        `Wrote ${OUT}\n  ${result.lines} lines, ${result.subs} substations\n  source: ${source}\n`
    );
})();
