#!/usr/bin/env node
/**
 * generate-population-grid.js
 * ---------------------------
 * Builds the gridded population-density field + city list that power the
 * "Population Density" heatmap (see js/population-overlay.js) and the
 * land/space-constraint feasibility check.
 *
 * Approach: Libya's population is highly concentrated on the coast with a few
 * Saharan oasis towns, so a kernel-density model from a real list of cities &
 * their populations reproduces the true distribution faithfully. Each city
 * contributes a Gaussian kernel scaled so it integrates to its population over
 * area, giving persons/km². The seed list below is sourced from GeoNames /
 * UN World Urbanization Prospects figures and is embedded so the build is
 * deterministic and offline-safe.
 *
 * Output: frontend/data/libya-population.json
 *   {
 *     parameter, unit, source, generated,
 *     latMin, latMax, lonMin, lonMax, step, nLat, nLon,
 *     density: [ nLat * nLon ],   // row-major, row 0 = north (latMax), persons/km²
 *     cities: [ { name, nameAr, lat, lon, population } ]
 *   }
 *
 * Regenerate:  node scripts/generate-population-grid.js
 */

const fs = require('fs');
const path = require('path');

// Libya bounding box (matches the GHI/wind grids); finer step for urban detail.
const LAT_MIN = 19.0, LAT_MAX = 34.0;
const LON_MIN = 9.0,  LON_MAX = 26.0;
const STEP = 0.1; // degrees (~11 km) — fine enough to resolve population centres

const OUT = path.join(__dirname, '..', 'data', 'libya-population.json');

// Real Libyan urban populations (GeoNames / UN WUP, urban-agglomeration scale).
// nameAr kept for the bilingual UI convention used elsewhere in the app.
const CITIES = [
    { name: 'Tripoli',   nameAr: 'طرابلس',  lat: 32.8872, lon: 13.1913, population: 1170000 },
    { name: 'Benghazi',  nameAr: 'بنغازي',  lat: 32.1167, lon: 20.0667, population: 807000 },
    { name: 'Misrata',   nameAr: 'مصراتة',  lat: 32.3754, lon: 15.0925, population: 386000 },
    { name: 'Tarhuna',   nameAr: 'ترهونة',  lat: 32.4350, lon: 13.6330, population: 210000 },
    { name: 'Al Khums',  nameAr: 'الخمس',   lat: 32.6486, lon: 14.2619, population: 202000 },
    { name: 'Zawiya',    nameAr: 'الزاوية', lat: 32.7522, lon: 12.7278, population: 200000 },
    { name: 'Zliten',    nameAr: 'زليتن',   lat: 32.4674, lon: 14.5687, population: 185000 },
    { name: 'Ajdabiya',  nameAr: 'أجدابيا', lat: 30.7556, lon: 20.2263, population: 145000 },
    { name: 'Sabha',     nameAr: 'سبها',    lat: 27.0377, lon: 14.4283, population: 130000 },
    { name: 'Sirte',     nameAr: 'سرت',     lat: 31.2089, lon: 16.5887, population: 128000 },
    { name: 'Al Bayda',  nameAr: 'البيضاء', lat: 32.7627, lon: 21.7551, population: 120000 },
    { name: 'Tobruk',    nameAr: 'طبرق',    lat: 32.0836, lon: 23.9764, population: 120000 },
    { name: 'Zuwara',    nameAr: 'زوارة',   lat: 32.9312, lon: 12.0820, population: 105000 },
    { name: 'Sabratha',  nameAr: 'صبراتة',  lat: 32.7933, lon: 12.4885, population: 102000 },
    { name: 'Derna',     nameAr: 'درنة',    lat: 32.7670, lon: 22.6367, population: 90000 },
    { name: 'Gharyan',   nameAr: 'غريان',   lat: 32.1722, lon: 13.0203, population: 87000 },
    { name: 'Bani Walid',nameAr: 'بني وليد',lat: 31.7455, lon: 13.9836, population: 78000 },
    { name: 'Murzuq',    nameAr: 'مرزق',    lat: 25.9155, lon: 13.9184, population: 45000 },
    { name: 'Ubari',     nameAr: 'أوباري',  lat: 26.5921, lon: 12.7762, population: 40000 },
    { name: 'Ghat',      nameAr: 'غات',     lat: 24.9647, lon: 10.1728, population: 25000 },
    { name: 'Kufra',     nameAr: 'الكفرة',  lat: 24.1781, lon: 23.3114, population: 50000 },
    { name: 'Jalu',      nameAr: 'جالو',    lat: 29.0331, lon: 21.5482, population: 14000 },
    { name: 'Hun',       nameAr: 'هون',     lat: 29.1268, lon: 15.9477, population: 23000 },
    { name: 'Nalut',     nameAr: 'نالوت',   lat: 31.8668, lon: 10.9817, population: 26000 },
    { name: 'Ghadames',  nameAr: 'غدامس',   lat: 30.1333, lon: 9.5000,  population: 10000 }
];

const nLat = Math.round((LAT_MAX - LAT_MIN) / STEP) + 1;
const nLon = Math.round((LON_MAX - LON_MIN) / STEP) + 1;
const idx = (row, col) => row * nLon + col;

const KM_PER_DEG_LAT = 111.0;
function kmPerDegLon(lat) { return 111.32 * Math.cos(lat * Math.PI / 180); }

/**
 * Each city is a 2-D Gaussian whose volume equals its population. For a kernel
 * with standard deviation sigma (km), the peak density (persons/km²) is
 * population / (2π·sigma²). Sigma scales mildly with city size so large cities
 * spread over a wider footprint. Density at a grid cell sums all kernels.
 */
function sigmaKmFor(population) {
    // ~4 km core for a small town up to ~14 km for the largest agglomerations.
    return 3.5 + 9.0 * Math.min(1, Math.pow(population / 1.2e6, 0.5));
}

function buildDensity() {
    const density = new Array(nLat * nLon).fill(0);

    // Precompute per-city peak + sigma.
    const kernels = CITIES.map((c) => {
        const sigma = sigmaKmFor(c.population);
        const peak = c.population / (2 * Math.PI * sigma * sigma); // persons/km²
        return { lat: c.lat, lon: c.lon, sigma, peak };
    });

    for (let r = 0; r < nLat; r++) {
        const lat = LAT_MAX - r * STEP;
        const kLon = kmPerDegLon(lat);
        for (let c = 0; c < nLon; c++) {
            const lon = LON_MIN + c * STEP;
            let sum = 0;
            for (const k of kernels) {
                const dyKm = (lat - k.lat) * KM_PER_DEG_LAT;
                const dxKm = (lon - k.lon) * kLon;
                const d2 = dxKm * dxKm + dyKm * dyKm;
                const twoSigma2 = 2 * k.sigma * k.sigma;
                // Skip negligible far-field contributions for speed.
                if (d2 > twoSigma2 * 12) continue;
                sum += k.peak * Math.exp(-d2 / twoSigma2);
            }
            density[idx(r, c)] = +sum.toFixed(1);
        }
    }
    return density;
}

const density = buildDensity();

const out = {
    parameter: 'POP_DENSITY',
    description: 'Population density (kernel model from city populations)',
    unit: 'persons/km2',
    source: 'GeoNames / UN World Urbanization Prospects city populations (Gaussian kernel density)',
    generated: new Date().toISOString().slice(0, 10),
    latMin: LAT_MIN, latMax: LAT_MAX, lonMin: LON_MIN, lonMax: LON_MAX,
    step: STEP, nLat, nLon,
    density,
    cities: CITIES
};

fs.writeFileSync(OUT, JSON.stringify(out));
const max = Math.max(...density);
process.stderr.write(
    `Wrote ${OUT}\n  ${nLat}×${nLon} grid, peak ${max.toFixed(0)} persons/km², ${CITIES.length} cities\n`
);
