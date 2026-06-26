window.HelioScout = window.HelioScout || {};

/**
 * Map Orchestration Layer using Leaflet.js
 */
HelioScout.Map = (function() {
    let map = null;
    let clickMarker = null;
    
    // Layer Groups
    let layers = {
        plants: null,
        proposed: null,
        grid: null,
        transmission: null,
        populationCentres: null
    };

    // Callback when map is clicked
    let onMapClickCallback = null;

    /**
     * Initialize the Leaflet map
     */
    function initMap(containerId, options = {}) {
        const defaultCenter = [27.5, 17.5]; // Center of Libya
        const defaultZoom = 6;

        map = L.map(containerId, {
            center: options.center || defaultCenter,
            zoom: options.zoom || defaultZoom,
            zoomControl: false // We reposition it in CSS
        });

        // Add Zoom Control to top-right
        L.control.zoom({ position: 'topright' }).addTo(map);

        // Base Tile Layers
        const darkTheme = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        });

        const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
            maxZoom: 18
        });

        // Default to dark theme
        darkTheme.addTo(map);

        // Store references for toggling
        HelioScout.Map.baseLayers = {
            dark: darkTheme,
            satellite: satellite
        };

        // Initialize empty layer groups
        layers.plants = L.layerGroup().addTo(map);
        layers.proposed = L.layerGroup().addTo(map);
        layers.grid = L.layerGroup(); // Not added by default
        layers.transmission = L.layerGroup();      // Toggled on demand
        layers.populationCentres = L.layerGroup();  // Toggled with the heatmap

        // Global-Solar-Atlas-style irradiance overlay (data-driven canvas raster).
        // Built from a precomputed NASA POWER GHI grid and shaded with the GSA
        // orange/red ramp — see js/solar-overlay.js. Loaded async; ready by the
        // time the user flips the "Solar Irradiance" toggle.
        if (HelioScout.SolarOverlay) {
            HelioScout.SolarOverlay.load(map).catch((err) =>
                console.error('[Map] Solar overlay failed to load:', err)
            );
        }

        // Global-Wind-Atlas-style 100 m wind-speed overlay (same engine).
        if (HelioScout.WindOverlay) {
            HelioScout.WindOverlay.load(map).catch((err) =>
                console.error('[Map] Wind overlay failed to load:', err)
            );
        }

        // Population-density heatmap (same raster engine; fades over empty desert).
        if (HelioScout.PopulationOverlay) {
            HelioScout.PopulationOverlay.load(map).catch((err) =>
                console.error('[Map] Population overlay failed to load:', err)
            );
        }

        // Handle Map Clicks
        map.on('click', function(e) {
            const lat = e.latlng.lat;
            const lon = e.latlng.lng;
            
            // Place temporary marker
            placeAssessmentMarker(lat, lon);
            
            // Trigger callback
            if (onMapClickCallback) {
                onMapClickCallback(lat, lon);
            }
        });

        return map;
    }

    /**
     * Place the assessment crosshair/marker
     */
    function placeAssessmentMarker(lat, lon, score = null) {
        if (clickMarker) {
            map.removeLayer(clickMarker);
        }

        let html = '';
        let className = 'assessment-marker';
        
        if (score !== null) {
            html = `<div class="assessment-marker__score">${score}</div>`;
            // Color based on score
            if (score >= 80) className += ' excel'; // We'll set inline styles instead
        }

        const bgColor = score === null ? '#64748b' : 
                       (score >= 85 ? '#06b6d4' : 
                       (score >= 70 ? '#10b981' : 
                       (score >= 50 ? '#f59e0b' : '#ef4444')));

        const icon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="${className}" style="background-color: ${bgColor};">${html}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 32]
        });

        clickMarker = L.marker([lat, lon], { icon }).addTo(map);
        
        // Pan to marker smoothly
        map.panTo([lat, lon], { animate: true, duration: 0.5 });
    }

    return {
        init: initMap,
        
        onMapClick: (cb) => { onMapClickCallback = cb; },
        
        placeMarker: placeAssessmentMarker,
        
        getMap: () => map,

        /**
         * Toggle Base Layer
         */
        setBaseLayer(type) {
            if (type === 'satellite') {
                map.removeLayer(HelioScout.Map.baseLayers.dark);
                HelioScout.Map.baseLayers.satellite.addTo(map);
            } else {
                map.removeLayer(HelioScout.Map.baseLayers.satellite);
                HelioScout.Map.baseLayers.dark.addTo(map);
            }
        },

        /**
         * Toggle Overlay Layer
         */
        toggleLayer(layerName, show) {
            // Solar / wind resource layers are canvas overlays with their own modules.
            if (layerName === 'solarHeatmap') {
                if (HelioScout.SolarOverlay) HelioScout.SolarOverlay.toggle(show);
                return;
            }
            if (layerName === 'windHeatmap') {
                if (HelioScout.WindOverlay) HelioScout.WindOverlay.toggle(show);
                return;
            }
            // Population heatmap raster + its labelled centres travel together.
            if (layerName === 'populationHeatmap') {
                if (HelioScout.PopulationOverlay) HelioScout.PopulationOverlay.toggle(show);
                if (layers.populationCentres) {
                    if (show) layers.populationCentres.addTo(map);
                    else map.removeLayer(layers.populationCentres);
                }
                return;
            }

            if (!layers[layerName]) return;

            if (show) {
                layers[layerName].addTo(map);
            } else {
                map.removeLayer(layers[layerName]);
            }
        },

        /**
         * Render Power Plants on the map
         */
        renderPlants(plants) {
            layers.plants.clearLayers();
            
            plants.forEach(plant => {
                const icon = HelioScout.Proposals.getPlantMarkerIcon(plant);
                
                const marker = L.marker([plant.lat, plant.lon], { icon }).bindPopup(`
                    <div style="text-align: center; margin-bottom: 5px;">
                        <strong>${plant.name}</strong><br>
                        <span style="color: #94a3b8; font-size: 11px;">${plant.nameAr}</span>
                    </div>
                    <table style="width: 100%; font-size: 11px; color: #cbd5e1;">
                        <tr><td>Capacity:</td><td style="text-align: right; font-weight: bold; color: white;">${plant.capacityMW} MW</td></tr>
                        <tr><td>Type:</td><td style="text-align: right;">${plant.config}</td></tr>
                        <tr><td>Fuel:</td><td style="text-align: right;">${plant.fuel}</td></tr>
                    </table>
                `);
                
                layers.plants.addLayer(marker);
            });
        },

        /**
         * Render Proposed Sites on the map
         * Uses getSiteMarkerIcon from proposals.js for ISO-standard SVG markers
         */
        renderProposedSites(sites) {
            layers.proposed.clearLayers();
            
            sites.forEach(site => {
                const icon = HelioScout.Proposals.getSiteMarkerIcon(site);

                // Type label map (IEC standard reference)
                const typeLabels = {
                    solar: 'Solar PV \u2014 IEC 61215',
                    wind:  'Wind \u2014 IEC 61400',
                    csp:   'CSP \u2014 IEC 62862',
                    hybrid:'Hybrid Solar+Wind'
                };
                const typeColors = {
                    solar: '#f59e0b',
                    wind:  '#3b82f6',
                    csp:   '#f97316',
                    hybrid:'#8b5cf6'
                };
                const borderColor = typeColors[site.type] || '#94a3b8';
                const typeLabel  = typeLabels[site.type]  || site.type.toUpperCase();

                const marker = L.marker([site.lat, site.lon], { icon }).bindPopup(`
                    <strong>${site.name}</strong><br>
                    <span style="font-size: 10px; text-transform: uppercase; color: ${borderColor};">${typeLabel}</span><br>
                    <div style="font-size: 11px; margin-top: 5px; color: #94a3b8;">Est. ${site.estimatedCapacityMW} MW</div>
                    <button class="btn btn-sm btn-primary" style="margin-top: 8px; width: 100%;" onclick="document.dispatchEvent(new CustomEvent('assess-proposal', {detail: {lat: ${site.lat}, lon: ${site.lon}}}))">Assess Location</button>
                `);
                
                layers.proposed.addLayer(marker);
            });
        },

        /**
         * Render the existing HV transmission network (GeoJSON: lines + substations).
         * Lines are coloured/weighted by voltage class; substations are square
         * connection-node markers. Called by js/transmission.js after it loads.
         */
        renderTransmission(geojson) {
            if (!layers.transmission) return;
            layers.transmission.clearLayers();

            // Voltage → colour/weight (higher voltage = bolder line).
            function lineStyle(v) {
                if (v >= 400) return { color: '#ef4444', weight: 3.0, opacity: 0.9 };
                if (v >= 220) return { color: '#f59e0b', weight: 2.4, opacity: 0.9 };
                if (v >= 132) return { color: '#eab308', weight: 1.8, opacity: 0.85 };
                return { color: '#94a3b8', weight: 1.3, opacity: 0.8 };
            }

            const geoLayer = L.geoJSON(geojson, {
                filter: (f) => f.properties && f.properties.kind === 'line',
                style: (f) => lineStyle(f.properties.voltage || 0),
                onEachFeature: (f, lyr) => {
                    const p = f.properties || {};
                    lyr.bindPopup(
                        `<strong>${p.name || 'Transmission line'}</strong><br>` +
                        `<span style="font-size:11px;color:#94a3b8;">${p.voltage ? p.voltage + ' kV' : 'voltage n/a'}` +
                        `${p.operator ? ' · ' + p.operator : ''}</span>`
                    );
                }
            });
            layers.transmission.addLayer(geoLayer);

            // Substation nodes as small squares.
            (geojson.features || []).forEach((f) => {
                if (!f.properties || f.properties.kind !== 'substation') return;
                const [lon, lat] = f.geometry.coordinates;
                const v = f.properties.voltage || 0;
                const color = v >= 400 ? '#ef4444' : (v >= 220 ? '#f59e0b' : '#eab308');
                const icon = L.divIcon({
                    className: 'substation-div-icon',
                    html: `<div class="substation-marker" style="border-color:${color};"></div>`,
                    iconSize: [10, 10],
                    iconAnchor: [5, 5]
                });
                const marker = L.marker([lat, lon], { icon }).bindPopup(
                    `<strong>${f.properties.name || 'Substation'}</strong><br>` +
                    `<span style="font-size:11px;color:#94a3b8;">${v ? v + ' kV substation' : 'substation'}</span>`
                );
                layers.transmission.addLayer(marker);
            });
        },

        /**
         * Render labelled population centres (scaled by population). Shown together
         * with the population heatmap toggle.
         */
        renderPopulationCentres(cities) {
            if (!layers.populationCentres) return;
            layers.populationCentres.clearLayers();
            (cities || []).forEach((c) => {
                const radius = Math.max(4, Math.min(20, Math.sqrt(c.population) / 90));
                const marker = L.circleMarker([c.lat, c.lon], {
                    radius,
                    color: '#fca5a5',
                    weight: 1,
                    fillColor: '#ef4444',
                    fillOpacity: 0.35
                }).bindTooltip(
                    `${c.name} — ${(c.population / 1000).toFixed(0)}k`,
                    { direction: 'top', className: 'pop-centre-tooltip' }
                );
                layers.populationCentres.addLayer(marker);
            });
        },

        /**
         * Add an ISO-compliant map legend control to the bottom-left corner.
         * The legend documents every marker symbol used on the map.
         */
        addLegend() {
            const LegendControl = L.Control.extend({
                options: { position: 'bottomleft' },
                onAdd() {
                    const div = L.DomUtil.create('div', 'map-legend');
                    div.innerHTML = `
                        <div class="map-legend__header">
                            Map Legend
                            <button class="map-legend__toggle" aria-label="Collapse legend">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18,15 12,9 6,15"/></svg>
                            </button>
                        </div>
                        <div class="map-legend__body">
                        <div class="map-legend__section">
                            <div class="map-legend__title">Existing Power Plants (GECOL)</div>
                            <div class="map-legend__item">
                                <span class="map-legend__marker" style="border-color:#10b981;"></span>
                                Operational
                            </div>
                            <div class="map-legend__item">
                                <span class="map-legend__marker" style="border-color:#f59e0b;"></span>
                                Partially Operational
                            </div>
                            <div class="map-legend__item">
                                <span class="map-legend__marker" style="border-color:#ef4444;"></span>
                                Offline
                            </div>
                        </div>
                        <div class="map-legend__section">
                            <div class="map-legend__title">Proposed RE Sites</div>
                            <div class="map-legend__item">
                                <span class="map-legend__marker map-legend__marker--proposed" style="border-color:#f59e0b; color:#f59e0b;">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
                                </span>
                                Solar PV <span class="map-legend__std">IEC 61215</span>
                            </div>
                            <div class="map-legend__item">
                                <span class="map-legend__marker map-legend__marker--proposed" style="border-color:#3b82f6; color:#3b82f6;">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><line x1="12" y1="10.5" x2="12" y2="4"/><line x1="10.7" y1="12.75" x2="5" y2="16"/><line x1="13.3" y1="12.75" x2="19" y2="16"/><line x1="12" y1="13.5" x2="12" y2="22"/></svg>
                                </span>
                                Wind <span class="map-legend__std">IEC 61400</span>
                            </div>
                            <div class="map-legend__item">
                                <span class="map-legend__marker map-legend__marker--proposed" style="border-color:#f97316; color:#f97316;">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M4 18Q8 6 12 8Q16 6 20 18"/><line x1="12" y1="8" x2="12" y2="18"/><circle cx="12" cy="7" r="1.5" fill="currentColor" stroke="none"/></svg>
                                </span>
                                CSP <span class="map-legend__std">IEC 62862</span>
                            </div>
                            <div class="map-legend__item">
                                <span class="map-legend__marker map-legend__marker--proposed" style="border-color:#8b5cf6; color:#8b5cf6;">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="7" cy="8" r="2.5"/><line x1="7" y1="3" x2="7" y2="5"/><line x1="7" y1="11" x2="7" y2="13"/><line x1="2" y1="8" x2="4" y2="8"/><line x1="10" y1="8" x2="12" y2="8"/><circle cx="18" cy="10" r="1" fill="currentColor" stroke="none"/><line x1="18" y1="9" x2="18" y2="5"/><line x1="16.7" y1="10.75" x2="14" y2="12.5"/><line x1="19.3" y1="10.75" x2="22" y2="12.5"/><line x1="18" y1="11" x2="18" y2="21"/></svg>
                                </span>
                                Hybrid
                            </div>
                        </div>
                        <div class="map-legend__section">
                            <div class="map-legend__title">Transmission Network (OSM)</div>
                            <div class="map-legend__item">
                                <span class="map-legend__line" style="background:#ef4444;"></span>
                                400 kV+
                            </div>
                            <div class="map-legend__item">
                                <span class="map-legend__line" style="background:#f59e0b;"></span>
                                220 kV
                            </div>
                            <div class="map-legend__item">
                                <span class="map-legend__line" style="background:#eab308;"></span>
                                66–150 kV
                            </div>
                            <div class="map-legend__item">
                                <span class="map-legend__marker map-legend__marker--substation"></span>
                                Substation
                            </div>
                        </div>
                        <div class="map-legend__section">
                            <div class="map-legend__title">Assessment</div>
                            <div class="map-legend__item">
                                <span class="map-legend__marker map-legend__marker--assessment"></span>
                                Assessed Location
                            </div>
                        </div>
                        </div>
                    `;
                    div.querySelector('.map-legend__toggle').addEventListener('click', function() {
                        div.classList.toggle('map-legend--collapsed');
                        this.setAttribute('aria-label', div.classList.contains('map-legend--collapsed') ? 'Expand legend' : 'Collapse legend');
                    });
                    L.DomEvent.disableClickPropagation(div);
                    return div;
                }
            });
            new LegendControl().addTo(map);
        },

        flyTo(lat, lon, zoom = 9) {
            map.flyTo([lat, lon], zoom, { duration: 1.5 });
        }
    };
})();
