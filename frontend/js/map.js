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
        grid: null
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
         */
        renderProposedSites(sites) {
            layers.proposed.clearLayers();
            
            sites.forEach(site => {
                // Determine color by type
                let borderColor = '#94a3b8';
                let iconChar = '⚡';
                
                if (site.type === 'solar') { borderColor = '#f59e0b'; iconChar = '☀️'; }
                else if (site.type === 'wind') { borderColor = '#06b6d4'; iconChar = '💨'; }
                else if (site.type === 'csp') { borderColor = '#f97316'; iconChar = '🔆'; }
                else if (site.type === 'hybrid') { borderColor = '#8b5cf6'; iconChar = '⚡'; }

                const icon = L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div class="proposed-marker" style="border-color: ${borderColor}; color: ${borderColor};">${iconChar}</div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                });
                
                const marker = L.marker([site.lat, site.lon], { icon }).bindPopup(`
                    <strong>${site.name}</strong><br>
                    <span style="font-size: 10px; text-transform: uppercase; color: ${borderColor};">${site.type} PROPOSAL</span><br>
                    <div style="font-size: 11px; margin-top: 5px; color: #94a3b8;">Est. ${site.estimatedCapacityMW} MW</div>
                    <button class="btn btn-sm btn-primary" style="margin-top: 8px; width: 100%;" onclick="document.dispatchEvent(new CustomEvent('assess-proposal', {detail: {lat: ${site.lat}, lon: ${site.lon}}}))">Assess Location</button>
                `);
                
                layers.proposed.addLayer(marker);
            });
        },

        flyTo(lat, lon, zoom = 9) {
            map.flyTo([lat, lon], zoom, { duration: 1.5 });
        }
    };
})();
