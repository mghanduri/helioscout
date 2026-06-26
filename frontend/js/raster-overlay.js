window.HelioScout = window.HelioScout || {};

/**
 * RasterOverlay (factory)
 * -----------------------
 * Shared engine behind the data-driven irradiance / wind overlays, modelled on
 * the Global Solar Atlas and Global Wind Atlas. Given a precomputed value grid
 * (NASA POWER climatology — see scripts/generate-*-grid.js) it:
 *   1. bilinearly interpolates the grid onto a canvas,
 *   2. shades each pixel through a fixed-domain colour ramp (absolute, so colours
 *      are comparable across the map rather than auto-stretched),
 *   3. samples in Web-Mercator Y so the raster aligns with Leaflet, and
 *   4. exposes it as an L.imageOverlay plus a matching gradient legend.
 *
 * Create one per layer via HelioScout.RasterOverlay.create({...}); see
 * js/solar-overlay.js and js/wind-overlay.js for the per-layer configuration.
 */
HelioScout.RasterOverlay = (function () {
    'use strict';

    // Web-Mercator latitude <-> Y helpers.
    const latToY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
    const yToLat = (y) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;

    function makeRamp(stops) {
        return function (t) {
            t = Math.max(0, Math.min(1, t));
            for (let i = 1; i < stops.length; i++) {
                if (t <= stops[i][0]) {
                    const [p0, c0] = stops[i - 1];
                    const [p1, c1] = stops[i];
                    const f = (t - p0) / (p1 - p0 || 1);
                    return [
                        Math.round(c0[0] + (c1[0] - c0[0]) * f),
                        Math.round(c0[1] + (c1[1] - c0[1]) * f),
                        Math.round(c0[2] + (c1[2] - c0[2]) * f)
                    ];
                }
            }
            return stops[stops.length - 1][1];
        };
    }

    /**
     * @param {Object} cfg
     * @param {string} cfg.dataUrl     path to the grid JSON (relative to base)
     * @param {string} cfg.valuesKey   array field in the JSON holding the values
     * @param {number} cfg.min,max     fixed colour domain
     * @param {Array}  cfg.ramp        [[pos0..1,[r,g,b]], …]
     * @param {number} cfg.opacity     overlay opacity (0..1)
     * @param {string} cfg.imgClass    CSS class for the <img>
     * @param {string} cfg.legendClass extra CSS class for the legend box
     * @param {string} cfg.title,unit,source  legend text
     * @param {number[]} cfg.ticks     legend tick values (min→max)
     * @param {string} cfg.logName     console-prefix label
     * @param {function} [cfg.alphaOf] optional (t, rawValue) → 0..1 pixel alpha.
     *                                 Lets a layer fade to transparent (e.g. the
     *                                 population heatmap over empty desert).
     *                                 Defaults to fully opaque.
     */
    function create(cfg) {
        const colorOf = makeRamp(cfg.ramp);
        const span = cfg.max - cfg.min || 1;

        let map = null;
        let overlay = null;
        let legendControl = null;
        let grid = null;
        let values = null;
        let visible = false;

        /** Bilinear sample of the grid at a geographic point. */
        function sample(lat, lon) {
            const { latMax, lonMin, step, nLat, nLon } = grid;
            let fr = (latMax - lat) / step;
            let fc = (lon - lonMin) / step;
            fr = Math.max(0, Math.min(nLat - 1, fr));
            fc = Math.max(0, Math.min(nLon - 1, fc));
            const r0 = Math.floor(fr), c0 = Math.floor(fc);
            const r1 = Math.min(nLat - 1, r0 + 1), c1 = Math.min(nLon - 1, c0 + 1);
            const dr = fr - r0, dc = fc - c0;
            const v00 = values[r0 * nLon + c0], v01 = values[r0 * nLon + c1];
            const v10 = values[r1 * nLon + c0], v11 = values[r1 * nLon + c1];
            const top = v00 + (v01 - v00) * dc;
            const bot = v10 + (v11 - v10) * dc;
            return top + (bot - top) * dr;
        }

        function buildImage() {
            const { latMin, latMax, lonMin, lonMax } = grid;
            const W = 540, H = 540;
            const canvas = document.createElement('canvas');
            canvas.width = W;
            canvas.height = H;
            const ctx = canvas.getContext('2d');
            const img = ctx.createImageData(W, H);
            const yTop = latToY(latMax), yBot = latToY(latMin);

            for (let py = 0; py < H; py++) {
                const lat = yToLat(yTop + (yBot - yTop) * (py / (H - 1)));
                for (let px = 0; px < W; px++) {
                    const lon = lonMin + (lonMax - lonMin) * (px / (W - 1));
                    const raw = sample(lat, lon);
                    const t = (raw - cfg.min) / span;
                    const [r, g, b] = colorOf(t);
                    const a = cfg.alphaOf ? Math.round(255 * Math.max(0, Math.min(1, cfg.alphaOf(t, raw)))) : 255;
                    const o = (py * W + px) * 4;
                    img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = a;
                }
            }
            ctx.putImageData(img, 0, 0);
            return {
                url: canvas.toDataURL('image/png'),
                bounds: L.latLngBounds([latMin, lonMin], [latMax, lonMax])
            };
        }

        function buildLegend() {
            const Ctl = L.Control.extend({
                options: { position: 'bottomright' },
                onAdd() {
                    const div = L.DomUtil.create('div', 'raster-legend ' + (cfg.legendClass || ''));
                    const stops = cfg.ramp
                        .map(([p, c]) => `rgb(${c[0]},${c[1]},${c[2]}) ${Math.round(p * 100)}%`)
                        .join(', ');
                    const ticks = cfg.ticks.map((v) => `<span>${v}</span>`).join('');
                    div.innerHTML = `
                        <div class="raster-legend__title">${cfg.title}</div>
                        <div class="raster-legend__bar" style="background: linear-gradient(to right, ${stops});"></div>
                        <div class="raster-legend__ticks">${ticks}</div>
                        <div class="raster-legend__unit">${cfg.unit}</div>
                        <div class="raster-legend__src">${cfg.source}</div>
                    `;
                    L.DomEvent.disableClickPropagation(div);
                    return div;
                }
            });
            return new Ctl();
        }

        return {
            async load(leafletMap) {
                map = leafletMap;
                const basePath = (typeof window !== 'undefined' && window.HELIOSCOUT_BASE) || '';
                const res = await fetch(basePath + cfg.dataUrl);
                if (!res.ok) throw new Error(`Failed to load ${cfg.dataUrl}: ${res.status}`);
                grid = await res.json();
                values = grid[cfg.valuesKey];

                const { url, bounds } = buildImage();
                overlay = L.imageOverlay(url, bounds, {
                    opacity: cfg.opacity,
                    interactive: false,
                    className: cfg.imgClass,
                    pane: 'overlayPane'
                });
                legendControl = buildLegend();
                console.log(`[${cfg.logName}] ${grid.nLat}×${grid.nLon} grid loaded — ${grid.source}`);
            },
            show() {
                if (!overlay || visible) return;
                overlay.addTo(map);
                legendControl.addTo(map);
                visible = true;
            },
            hide() {
                if (!overlay || !visible) return;
                map.removeLayer(overlay);
                map.removeControl(legendControl);
                visible = false;
            },
            toggle(on) { on ? this.show() : this.hide(); },
            isReady: () => !!overlay,
            /**
             * Bilinear value at a geographic point, or null until the grid has
             * loaded. Lets other modules (e.g. feasibility checks) read the
             * underlying field without re-fetching it.
             */
            sampleAt(lat, lon) { return values ? sample(lat, lon) : null; },
            /** The loaded grid object (incl. any non-value fields like `cities`), or null. */
            getGrid() { return grid; }
        };
    }

    return { create };
})();
