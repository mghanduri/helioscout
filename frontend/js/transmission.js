window.HelioScout = window.HelioScout || {};

/**
 * Transmission
 * ------------
 * Loads Libya's existing high-voltage transmission network (GeoJSON from
 * data/libya-transmission.json — OpenStreetMap via Overpass; see
 * scripts/generate-transmission.js) and answers the question that decides
 * whether a candidate site is economic: how far is the grid, and at what voltage?
 *
 *   getNearestTransmission(lat, lon) → { distanceKm, voltage, lineName,
 *                                        connectPoint, nearestSubstation }
 *
 * Distance is the shortest great-circle distance from the point to ANY line
 * segment (not just vertices), computed on a local equirectangular projection
 * (km) — accurate at Libya's scale and cheap enough to scan every segment.
 */
HelioScout.Transmission = (function () {
    'use strict';

    var geojson = null;
    var segments = [];     // { ax, ay, bx, by (lon/lat), voltage, name }
    var substations = [];  // { lat, lon, voltage, name }

    var KM_PER_DEG_LAT = 111.0;
    function kmPerDegLon(lat) { return 111.32 * Math.cos(lat * Math.PI / 180); }

    /**
     * Shortest distance (km) from point P to segment A→B, using a local planar
     * projection centred on P. Returns { distKm, point:[lon,lat] }.
     */
    function pointToSegmentKm(plat, plon, ax, ay, bx, by) {
        var kLon = kmPerDegLon(plat);
        // Project to km relative to P (P at origin).
        var Ax = (ax - plon) * kLon, Ay = (ay - plat) * KM_PER_DEG_LAT;
        var Bx = (bx - plon) * kLon, By = (by - plat) * KM_PER_DEG_LAT;
        var dx = Bx - Ax, dy = By - Ay;
        var len2 = dx * dx + dy * dy;
        var t = len2 > 0 ? -(Ax * dx + Ay * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        var cx = Ax + t * dx, cy = Ay + t * dy;
        var distKm = Math.sqrt(cx * cx + cy * cy);
        // Back-project the closest point to lon/lat for display.
        var lon = plon + cx / kLon;
        var lat = plat + cy / KM_PER_DEG_LAT;
        return { distKm: distKm, point: [lon, lat] };
    }

    function buildIndex() {
        segments = [];
        substations = [];
        (geojson.features || []).forEach(function (f) {
            var p = f.properties || {};
            if (p.kind === 'line' && f.geometry && f.geometry.type === 'LineString') {
                var c = f.geometry.coordinates;
                for (var i = 0; i < c.length - 1; i++) {
                    segments.push({
                        ax: c[i][0], ay: c[i][1],
                        bx: c[i + 1][0], by: c[i + 1][1],
                        voltage: p.voltage || null,
                        name: p.name || null
                    });
                }
            } else if (p.kind === 'substation' && f.geometry && f.geometry.type === 'Point') {
                substations.push({
                    lon: f.geometry.coordinates[0],
                    lat: f.geometry.coordinates[1],
                    voltage: p.voltage || null,
                    name: p.name || null
                });
            }
        });
    }

    return {
        async load() {
            var basePath = (typeof window !== 'undefined' && window.HELIOSCOUT_BASE) || '';
            var res = await fetch(basePath + 'data/libya-transmission.json');
            if (!res.ok) throw new Error('Failed to load libya-transmission.json: ' + res.status);
            geojson = await res.json();
            buildIndex();
            console.log('[Transmission] ' + segments.length + ' segments, ' +
                substations.length + ' substations — ' + geojson.source);
            if (HelioScout.Map && HelioScout.Map.renderTransmission) {
                HelioScout.Map.renderTransmission(geojson);
            }
            return geojson;
        },

        getGeoJSON: function () { return geojson; },

        isReady: function () { return segments.length > 0; },

        /**
         * Nearest transmission line (and substation) to a point.
         * @returns {{distanceKm:number, voltage:number|null, lineName:string|null,
         *            connectPoint:[lon,lat], nearestSubstation:Object|null}|null}
         */
        getNearestTransmission: function (lat, lon) {
            if (!segments.length) return null;

            var best = null, bestDist = Infinity;
            for (var i = 0; i < segments.length; i++) {
                var s = segments[i];
                var r = pointToSegmentKm(lat, lon, s.ax, s.ay, s.bx, s.by);
                if (r.distKm < bestDist) {
                    bestDist = r.distKm;
                    best = { seg: s, point: r.point };
                }
            }

            // Nearest substation (informational — a real interconnect lands at a bay).
            var bestSub = null, bestSubDist = Infinity;
            for (var j = 0; j < substations.length; j++) {
                var su = substations[j];
                var dyKm = (lat - su.lat) * KM_PER_DEG_LAT;
                var dxKm = (lon - su.lon) * kmPerDegLon(lat);
                var d = Math.sqrt(dxKm * dxKm + dyKm * dyKm);
                if (d < bestSubDist) { bestSubDist = d; bestSub = su; }
            }

            return {
                distanceKm: Math.round(bestDist * 10) / 10,
                voltage: best.seg.voltage,
                lineName: best.seg.name,
                connectPoint: best.point,
                nearestSubstation: bestSub
                    ? { name: bestSub.name, voltage: bestSub.voltage,
                        lat: bestSub.lat, lon: bestSub.lon,
                        distanceKm: Math.round(bestSubDist * 10) / 10 }
                    : null
            };
        }
    };
})();
