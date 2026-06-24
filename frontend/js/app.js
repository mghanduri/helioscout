/**
 * Main Application Orchestrator for RenewMap
 */
document.addEventListener('DOMContentLoaded', async () => {
    
    // Elements
    const els = {
        // App State
        app: document.getElementById('app'),
        modeBtn: document.getElementById('mode-btn'),
        modeUnivBtn: document.getElementById('mode-universal-btn'),
        loadingScreen: document.getElementById('initial-loading'),
        
        // Navigation
        coordLat: document.getElementById('coord-lat'),
        coordLon: document.getElementById('coord-lon'),
        searchInput: document.getElementById('search-input'),
        searchResults: document.getElementById('search-results'),
        
        // Panels
        assessmentPanel: document.getElementById('assessment-panel'),
        assessmentClose: document.getElementById('assessment-close'),
        loadingOverlay: document.getElementById('assessment-loading'),
        contentOverlay: document.getElementById('assessment-content'),
        
        // Toggles
        layerToggles: document.querySelectorAll('.layer-toggle input'),
        
        // Tabs
        tabBtns: document.querySelectorAll('.tab-btn'),
        tabContents: document.querySelectorAll('.tab-content'),
        
        // UI Metrics
        scoreRingFill: document.getElementById('score-ring-fill'),
        scoreRingValue: document.getElementById('score-ring-value'),
        locationName: document.getElementById('assessment-location-name'),
        assessmentCoords: document.getElementById('assessment-coords'),
        recText: document.getElementById('rec-text'),
        
        // Solar Metrics
        metricGhi: document.getElementById('metric-ghi'),
        metricPvOut: document.getElementById('metric-pvout'),
        metricSolarCf: document.getElementById('metric-solar-cf'),
        metricTilt: document.getElementById('metric-tilt'),
        metricTemp: document.getElementById('metric-temp'),
        metricTempImpact: document.getElementById('metric-temp-impact'),
        metricTempImpactDesc: document.getElementById('metric-temp-impact-desc'),
        solarScoreBar: document.getElementById('solar-score-bar'),
        solarScoreValue: document.getElementById('solar-score-value'),
        solarRating: document.getElementById('solar-rating'),
        
        // Wind Metrics
        metricWind100: document.getElementById('metric-wind100'),
        metricWpd: document.getElementById('metric-wpd'),
        metricWindClass: document.getElementById('metric-wind-class'),
        metricWindClassDesc: document.getElementById('metric-wind-class-desc'),
        metricWindCf: document.getElementById('metric-wind-cf'),
        metricWind50: document.getElementById('metric-wind50'),
        metricWind10: document.getElementById('metric-wind10'),
        windScoreBar: document.getElementById('wind-score-bar'),
        windScoreValue: document.getElementById('wind-score-value'),
        windRating: document.getElementById('wind-rating'),
        
        // CSP Metrics
        metricDni: document.getElementById('metric-dni'),
        metricDniAnnual: document.getElementById('metric-dni-annual'),
        metricCspSuit: document.getElementById('metric-csp-suit'),
        metricGeo: document.getElementById('metric-geo'),
        metricGeoDesc: document.getElementById('metric-geo-desc'),
        cspScoreBar: document.getElementById('csp-score-bar'),
        cspScoreValue: document.getElementById('csp-score-value'),
        cspRating: document.getElementById('csp-rating'),
        
        // Financial Metrics
        finCapacity: document.getElementById('fin-capacity'),
        finCapacityVal: document.getElementById('fin-capacity-val'),
        finTurbine: document.getElementById('fin-turbine'),
        finAge: document.getElementById('fin-age'),
        finAgeVal: document.getElementById('fin-age-val'),
        finDomPrice: document.getElementById('fin-domestic-price'),
        finDomPriceVal: document.getElementById('fin-domestic-price-val'),
        finExpPrice: document.getElementById('fin-export-price'),
        finExpPriceVal: document.getElementById('fin-export-price-val'),
        
        finGasFreed: document.getElementById('fin-gas-freed'),
        finExpValue: document.getElementById('fin-export-value'),
        finDomValue: document.getElementById('fin-domestic-value'),
        finLcoe: document.getElementById('fin-lcoe'),
        finCo2: document.getElementById('fin-co2'),
        finPayback: document.getElementById('fin-payback'),
        finNpv: document.getElementById('fin-npv')
    };

    // State
    let currentState = {
        mode: 'libya', // 'libya' or 'universal'
        currentLat: null,
        currentLon: null,
        currentAssessment: null
    };

    // 1. Initialize Map
    RenewMap.Map.init('map');
    
    // Map Click Handler -> Trigger Assessment
    RenewMap.Map.onMapClick((lat, lon) => {
        runAssessment(lat, lon);
    });
    
    // Update Coordinates Display on Mousemove
    RenewMap.Map.getMap().on('mousemove', (e) => {
        els.coordLat.textContent = `${e.latlng.lat.toFixed(4)}°${e.latlng.lat >= 0 ? 'N' : 'S'}`;
        els.coordLon.textContent = `${e.latlng.lng.toFixed(4)}°${e.latlng.lng >= 0 ? 'E' : 'W'}`;
    });

    // Load Initial Data (Plants & Proposals)
    try {
        await RenewMap.Proposals.loadData();
        const plants = RenewMap.Proposals.getPlants();
        const proposals = RenewMap.Proposals.getProposedSites('all');
        
        RenewMap.Map.renderPlants(plants);
        RenewMap.Map.renderProposedSites(proposals);
        
        renderProposalsList(proposals);
        
    } catch (e) {
        console.error("Failed to load initial data:", e);
    }
    
    // Hide Loading Screen
    setTimeout(() => {
        els.loadingScreen.classList.add('fade-out');
    }, 800);

    // ==========================================
    // Core Assessment Flow
    // ==========================================
    
    async function runAssessment(lat, lon) {
        currentState.currentLat = lat;
        currentState.currentLon = lon;
        
        // Check bounds if in Libya mode
        if (currentState.mode === 'libya') {
            if (lat < 19 || lat > 34 || lon < 9 || lon > 25) {
                alert("Location is outside Libya. Please switch to Universal Mode to assess locations worldwide.");
                return;
            }
        }

        // Fetch Assessment Data from Backend
        const assessment = await RenewMap.API.fetchAllData(lat, lon);
        if (!assessment) return; // Aborted or failed
        
        currentState.currentAssessment = assessment;
        
        // Update Map Marker
        RenewMap.Map.placeMarker(lat, lon, assessment.overallScore);
        
        // Reverse Geocode (Basic fallback for demo)
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`)
            .then(res => res.json())
            .then(data => {
                els.locationName.textContent = data.name || data.address?.city || data.address?.town || data.address?.state || "Unknown Location";
            })
            .catch(() => {
                els.locationName.textContent = "Assessed Location";
            });
            
        els.assessmentCoords.textContent = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
        
        // Populate UI
        populateUI(assessment);
        
        // Calculate Financials if in Libya mode
        if (currentState.mode === 'libya') {
            updateFinancials();
        }
        
        // Switch views
        els.loadingOverlay.classList.add('hidden');
        els.contentOverlay.classList.remove('hidden');
        
        // Render Charts (default tab might be charts or we just prep them)
        RenewMap.Charts.renderMonthlyChart('monthly-chart', assessment.solar.monthlyProfile, null);
        RenewMap.Charts.renderRadarChart('radar-chart', assessment.radarData || {
            solar: assessment.solar.score,
            wind: assessment.wind.score,
            csp: assessment.csp.score,
            geo: assessment.geo.score
        });
    }

    function populateUI(data) {
        // Overall
        const scoreCircle = Math.round(327 - (327 * data.overallScore / 100)); // 327 is approx dasharray for r=52
        els.scoreRingFill.style.strokeDashoffset = scoreCircle;
        
        // Color the ring
        let ringColor = '#ef4444';
        if (data.overallScore >= 80) ringColor = '#10b981';
        else if (data.overallScore >= 60) ringColor = '#f59e0b';
        els.scoreRingFill.style.stroke = ringColor;
        
        // Animate counter (simplified)
        els.scoreRingValue.textContent = data.overallScore;
        els.recText.textContent = `Recommended: ${data.recommendation}`;
        
        // Solar Tab
        els.metricGhi.textContent = data.solar.ghi.annual.toFixed(2);
        els.metricPvOut.textContent = data.solar.pvOutput ? data.solar.pvOutput.toFixed(0) : 'N/A';
        els.metricSolarCf.textContent = data.solar.capacityFactor.toFixed(1);
        els.metricTilt.textContent = data.solar.optimalTilt ? Math.round(data.solar.optimalTilt) : '—';
        els.metricTemp.textContent = data.solar.avgTemp.toFixed(1);
        els.metricTempImpact.textContent = data.solar.tempImpact;
        els.metricTempImpactDesc.textContent = data.solar.tempDesc;
        
        els.solarScoreBar.style.width = `${data.solar.score}%`;
        els.solarScoreValue.textContent = data.solar.score;
        els.solarRating.textContent = data.solar.rating;
        els.solarRating.style.color = data.solar.color;

        // Wind Tab
        if (data.wind) {
            els.metricWind100.textContent = data.wind.v100.toFixed(2);
            els.metricWpd.textContent = data.wind.wpd.toFixed(0);
            els.metricWindClass.textContent = data.wind.windClassDesc.split('(')[0].trim();
            els.metricWindClassDesc.textContent = data.wind.windClassDesc;
            els.metricWindCf.textContent = data.wind.estimatedCF.toFixed(1);
            els.metricWind50.textContent = data.wind.v50.toFixed(2);
            els.metricWind10.textContent = data.wind.v10.toFixed(2);
            
            els.windScoreBar.style.width = `${data.wind.score}%`;
            els.windScoreValue.textContent = data.wind.score;
            els.windRating.textContent = data.wind.rating;
            els.windRating.style.color = data.wind.color;
        } else {
            // Null state
            els.metricWind100.textContent = '—';
            els.windScoreBar.style.width = '0%';
            els.windScoreValue.textContent = '0';
            els.windRating.textContent = 'Insufficient Data';
        }

        // CSP Tab
        els.metricDni.textContent = data.csp.dniDaily.toFixed(2);
        els.metricDniAnnual.textContent = Math.round(data.csp.dniAnnual).toLocaleString();
        els.metricCspSuit.textContent = data.csp.suitability;
        els.metricGeo.textContent = data.geo.indicator;
        els.metricGeoDesc.textContent = data.geo.description;
        
        els.cspScoreBar.style.width = `${data.csp.score}%`;
        els.cspScoreValue.textContent = data.csp.score;
        els.cspRating.textContent = data.csp.suitability;
        els.cspRating.style.color = data.csp.color;
    }

    function updateFinancials() {
        if (!currentState.currentAssessment) return;
        
        const a = currentState.currentAssessment;
        
        // Gather inputs
        const capMW = parseFloat(els.finCapacity.value);
        const turbineId = els.finTurbine.value;
        const ageYears = parseFloat(els.finAge.value);
        const domPrice = parseFloat(els.finDomPrice.value);
        const expPrice = parseFloat(els.finExpPrice.value);
        
        // Calculate PV generation (using solar CF)
        const pvLcoe = RenewMap.Financial.calculateLCOE('solar', capMW, a.solar.capacityFactor);
        
        // Calculate Displacement
        const disp = RenewMap.Financial.calculateGasDisplacement(
            pvLcoe.annualMWh, 
            turbineId, 
            a.solar.avgTemp, 
            ageYears, 
            domPrice, 
            expPrice
        );
        
        // Calculate NPV based on export revenue
        const npv = RenewMap.Financial.calculateNPV(pvLcoe.totalCapex, disp.exportValue, pvLcoe.annualOpex, 25);
        
        // Populate UI
        els.finGasFreed.textContent = Math.round(disp.gasFreedMMBtu).toLocaleString();
        els.finExpValue.textContent = '$' + Math.round(disp.exportValue).toLocaleString();
        els.finDomValue.textContent = '$' + Math.round(disp.domesticValue).toLocaleString();
        els.finLcoe.textContent = pvLcoe.lcoe.toFixed(2);
        els.finCo2.textContent = Math.round(disp.co2AvoidedTonnes).toLocaleString();
        els.finPayback.textContent = npv.paybackYears ? npv.paybackYears.toFixed(1) : '>25';
        
        // Format NPV
        const npvFormatted = (npv.npv / 1000000).toFixed(1);
        els.finNpv.textContent = npv.npv >= 0 ? `+$${npvFormatted}M` : `-$${Math.abs(npvFormatted)}M`;
        els.finNpv.style.color = npv.npv >= 0 ? 'var(--financial-500)' : 'var(--danger)';
    }

    // ==========================================
    // Event Listeners
    // ==========================================

    // Panel Close
    els.assessmentClose.addEventListener('click', () => {
        els.assessmentPanel.classList.add('hidden');
    });

    // Mode Toggle
    els.modeBtn.addEventListener('click', () => setMode('libya'));
    els.modeUnivBtn.addEventListener('click', () => setMode('universal'));
    
    function setMode(mode) {
        currentState.mode = mode;
        if (mode === 'libya') {
            els.modeBtn.classList.add('active');
            els.modeUnivBtn.classList.remove('active');
            document.getElementById('financial-tab-btn').classList.remove('hidden');
            RenewMap.Map.toggleLayer('plants', true);
            RenewMap.Map.toggleLayer('proposed', true);
            document.getElementById('toggle-plants').querySelector('input').checked = true;
            document.getElementById('toggle-proposed').querySelector('input').checked = true;
        } else {
            els.modeBtn.classList.remove('active');
            els.modeUnivBtn.classList.add('active');
            document.getElementById('financial-tab-btn').classList.add('hidden');
            // If on financial tab, switch to solar
            if (document.getElementById('tab-financial').classList.contains('active')) {
                els.tabBtns[0].click();
            }
            RenewMap.Map.toggleLayer('plants', false);
            RenewMap.Map.toggleLayer('proposed', false);
            document.getElementById('toggle-plants').querySelector('input').checked = false;
            document.getElementById('toggle-proposed').querySelector('input').checked = false;
        }
    }

    // Tabs
    els.tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove active classes
            els.tabBtns.forEach(b => b.classList.remove('active'));
            els.tabContents.forEach(c => c.classList.remove('active'));
            
            // Add active to clicked
            const targetTab = e.currentTarget.getAttribute('data-tab');
            e.currentTarget.classList.add('active');
            document.getElementById(`tab-${targetTab}`).classList.add('active');
        });
    });

    // Map Layer Toggles
    els.layerToggles.forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const layer = e.target.value;
            const checked = e.target.checked;
            
            if (layer === 'satellite') {
                RenewMap.Map.setBaseLayer(checked ? 'satellite' : 'dark');
            } else {
                RenewMap.Map.toggleLayer(layer, checked);
            }
        });
    });

    // Financial Inputs (Slider syncing)
    ['fin-capacity', 'fin-age', 'fin-domestic-price', 'fin-export-price'].forEach(id => {
        const el = document.getElementById(id);
        const valEl = document.getElementById(`${id}-val`);
        el.addEventListener('input', (e) => {
            let valStr = e.target.value;
            if (id === 'fin-capacity') valStr += ' MW';
            if (id === 'fin-age') valStr += ' yrs';
            if (id.includes('price')) valStr = '$' + parseFloat(valStr).toFixed(2);
            valEl.textContent = valStr;
            updateFinancials();
        });
    });
    
    els.finTurbine.addEventListener('change', updateFinancials);

    // Filter Proposals
    document.querySelectorAll('.filter-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            const type = e.currentTarget.getAttribute('data-filter');
            const filtered = RenewMap.Proposals.getProposedSites(type === 'all' ? null : type);
            renderProposalsList(filtered);
        });
    });

    function renderProposalsList(sites) {
        const list = document.getElementById('proposals-list');
        list.innerHTML = '';
        sites.forEach(site => {
            list.innerHTML += RenewMap.Proposals.generateSiteCard(site);
        });
        
        // Bind assess buttons
        list.querySelectorAll('.site-card__assess').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const lat = parseFloat(e.currentTarget.getAttribute('data-lat'));
                const lon = parseFloat(e.currentTarget.getAttribute('data-lon'));
                RenewMap.Map.flyTo(lat, lon, 10);
                setTimeout(() => runAssessment(lat, lon), 1500); // Wait for flight
            });
        });
    }

    // Global listener for markers clicking "Assess Location"
    document.addEventListener('assess-proposal', (e) => {
        const { lat, lon } = e.detail;
        map.closePopup();
        runAssessment(lat, lon);
    });

    // Geocoding Search (Basic implementation)
    let searchTimeout;
    els.searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        if (query.length < 3) {
            els.searchResults.classList.add('hidden');
            return;
        }
        
        searchTimeout = setTimeout(() => {
            fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`)
                .then(res => res.json())
                .then(data => {
                    els.searchResults.innerHTML = '';
                    if (data.length === 0) {
                        els.searchResults.innerHTML = '<div class="search-result-item text-muted">No results found</div>';
                    } else {
                        data.forEach(item => {
                            const div = document.createElement('div');
                            div.className = 'search-result-item';
                            div.textContent = item.display_name;
                            div.addEventListener('click', () => {
                                els.searchResults.classList.add('hidden');
                                els.searchInput.value = item.display_name.split(',')[0];
                                const lat = parseFloat(item.lat);
                                const lon = parseFloat(item.lon);
                                RenewMap.Map.flyTo(lat, lon, 10);
                                setTimeout(() => runAssessment(lat, lon), 1500);
                            });
                            els.searchResults.appendChild(div);
                        });
                    }
                    els.searchResults.classList.remove('hidden');
                });
        }, 500);
    });
    
    // Close search on click outside
    document.addEventListener('click', (e) => {
        if (!els.searchInput.contains(e.target) && !els.searchResults.contains(e.target)) {
            els.searchResults.classList.add('hidden');
        }
    });

});
