/**
 * Main Application Orchestrator for HelioScout
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
        finNpv: document.getElementById('fin-npv'),
        finBasis: document.getElementById('fin-basis')
    };

    // State
    let currentState = {
        mode: 'libya', // 'libya' or 'universal'
        currentLat: null,
        currentLon: null,
        currentAssessment: null
    };

    // 1. Initialize Map
    HelioScout.Map.init('map');
    
    // Map Click Handler -> Trigger Assessment
    HelioScout.Map.onMapClick((lat, lon) => {
        runAssessment(lat, lon);
    });
    
    // Update Coordinates Display on Mousemove
    HelioScout.Map.getMap().on('mousemove', (e) => {
        els.coordLat.textContent = `${e.latlng.lat.toFixed(4)}°${e.latlng.lat >= 0 ? 'N' : 'S'}`;
        els.coordLon.textContent = `${e.latlng.lng.toFixed(4)}°${e.latlng.lng >= 0 ? 'E' : 'W'}`;
    });

    // Load Initial Data (Plants & Proposals)
    try {
        await HelioScout.Proposals.loadData();
        const plants = HelioScout.Proposals.getPlants();
        const proposals = HelioScout.Proposals.getProposedSites('all');
        
        HelioScout.Map.renderPlants(plants);
        HelioScout.Map.renderProposedSites(proposals);
        
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
        const assessment = await HelioScout.API.fetchAllData(lat, lon);
        if (!assessment) return; // Aborted or failed
        
        currentState.currentAssessment = assessment;
        
        // Update Map Marker
        HelioScout.Map.placeMarker(lat, lon, assessment.overallScore);
        
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
            autoMapNearestPlant(lat, lon);
            updateFinancials();
        }

        // Switch views
        els.loadingOverlay.classList.add('hidden');
        els.contentOverlay.classList.remove('hidden');

        // Update pin button state for this location
        refreshPinButton();

        // Render Charts (default tab might be charts or we just prep them)
        HelioScout.Charts.renderMonthlyChart('monthly-chart', assessment.solar.monthlyProfile, null);
        HelioScout.Charts.renderRadarChart('radar-chart', {
            solar: assessment.solar.score,
            wind: assessment.wind ? assessment.wind.score : 0,
            csp: assessment.csp.score
        });
    }

    /**
     * Infer the displaced turbine + plant age from the nearest GECOL plant
     * and pre-fill the financial controls. The user can still override.
     */
    function autoMapNearestPlant(lat, lon) {
        const nearest = HelioScout.Proposals.getNearestPlant(lat, lon);
        if (!nearest || !nearest.plant) {
            if (els.finBasis) els.finBasis.textContent = '';
            return;
        }
        const p = nearest.plant;
        const turbineId = HelioScout.Financial.classConfigToTurbineId(p.turbineClass, p.config);
        els.finTurbine.value = turbineId;

        if (p.yearBuilt) {
            const age = Math.max(0, new Date().getFullYear() - p.yearBuilt);
            els.finAge.value = Math.min(age, parseInt(els.finAge.max, 10));
            els.finAgeVal.textContent = `${els.finAge.value} yrs`;
        }

        if (els.finBasis) {
            els.finBasis.textContent =
                `Basis: nearest plant — ${p.name} (${p.config} ${p.turbineClass || ''}, built ${p.yearBuilt || 'n/a'}), ${nearest.distanceKm} km away.`;
        }
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
        const pvLcoe = HelioScout.Financial.calculateLCOE('solar', capMW, a.solar.capacityFactor);

        // Derate at warm-season temperature (realistic operating ambient), not annual mean.
        const deratingTemp = (a.solar.summerTemp != null) ? a.solar.summerTemp : a.solar.avgTemp;

        // Calculate Displacement
        const disp = HelioScout.Financial.calculateGasDisplacement(
            pvLcoe.annualMWh,
            turbineId,
            deratingTemp,
            ageYears,
            domPrice,
            expPrice
        );

        // Calculate NPV based on export revenue
        const npv = HelioScout.Financial.calculateNPV(pvLcoe.totalCapex, disp.exportValue, pvLcoe.annualOpex, 25);

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

        // Cache a compact summary for the Compare feature
        currentState.financialSummary = {
            lcoeSolar: pvLcoe.lcoe,
            gasDisplacement: disp.gasFreedMMBtu,   // MMBtu/yr
            gasValue: disp.exportValue / 1e6,       // $M/yr (export-parity)
            npv: npv.npv,
            paybackYears: npv.paybackYears
        };
    }

    // ==========================================
    // Site Comparison (pin / compare / export)
    // ==========================================

    /**
     * Map the backend assessment shape onto the shape HelioScout.Compare expects.
     */
    function buildCompareRecord(assessment) {
        const fin = currentState.financialSummary;
        return {
            id: `${assessment.lat.toFixed(4)}_${assessment.lon.toFixed(4)}`,
            name: (els.locationName.textContent || 'Site').trim(),
            lat: assessment.lat,
            lon: assessment.lon,
            solar: {
                ghi: assessment.solar.ghi.annual,
                pvOutput: assessment.solar.pvOutput,
                score: assessment.solar.score
            },
            wind: assessment.wind ? {
                speed100m: assessment.wind.v100,
                capacityFactor: assessment.wind.estimatedCF,
                score: assessment.wind.score
            } : null,
            csp: {
                dni: assessment.csp.dniAnnual,
                score: assessment.csp.score
            },
            composite: assessment.overallScore,
            financial: (currentState.mode === 'libya' && fin) ? {
                lcoeSolar: fin.lcoeSolar,
                gasDisplacement: fin.gasDisplacement,
                gasValue: fin.gasValue
            } : null
        };
    }

    const pinBtn = document.getElementById('pin-site-btn');
    const compareBtn = document.getElementById('compare-btn');
    const pinnedList = document.getElementById('pinned-list');
    const pinnedCount = document.getElementById('pinned-count');
    const comparisonModal = document.getElementById('comparison-modal');
    const comparisonBody = document.getElementById('comparison-body');

    function refreshPinButton() {
        if (!currentState.currentAssessment) return;
        const a = currentState.currentAssessment;
        const pinned = HelioScout.Compare.isPinned(a.lat, a.lon);
        pinBtn.classList.toggle('is-pinned', pinned);
        pinBtn.title = pinned ? 'Unpin this site' : 'Pin this site for comparison';
    }

    function renderPinnedSidebar() {
        const sites = HelioScout.Compare.getPinnedSites();
        pinnedCount.textContent = sites.length;

        if (sites.length === 0) {
            pinnedList.innerHTML = '<div class="empty-state"><p>Click on the map to assess a location, then pin it for comparison.</p></div>';
            compareBtn.classList.add('hidden');
            return;
        }

        compareBtn.classList.toggle('hidden', sites.length < 2);
        pinnedList.innerHTML = sites.map(function (s) {
            return '<div class="pinned-item" data-site-id="' + s.id + '">' +
                '<div class="pinned-item__info">' +
                    '<span class="pinned-item__name">' + (s.name || s.id) + '</span>' +
                    '<span class="pinned-item__score">Score ' + (s.composite != null ? s.composite : '—') + '</span>' +
                '</div>' +
                '<button class="pinned-item__remove" data-site-id="' + s.id + '" title="Remove">✕</button>' +
            '</div>';
        }).join('');

        pinnedList.querySelectorAll('.pinned-item__remove').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                HelioScout.Compare.unpinSite(e.currentTarget.getAttribute('data-site-id'));
                renderPinnedSidebar();
                refreshPinButton();
            });
        });
    }
    HelioScout.Compare.onUpdate = renderPinnedSidebar;

    pinBtn.addEventListener('click', () => {
        if (!currentState.currentAssessment) return;
        const record = buildCompareRecord(currentState.currentAssessment);
        if (HelioScout.Compare.isPinned(record.lat, record.lon)) {
            HelioScout.Compare.unpinSite(record.id);
        } else {
            if (!HelioScout.Compare.pinSite(record)) {
                alert('Maximum of 5 sites can be pinned for comparison.');
                return;
            }
        }
        renderPinnedSidebar();
        refreshPinButton();
    });

    function openComparison() {
        comparisonBody.innerHTML = HelioScout.Compare.generateComparisonTable();
        comparisonBody.querySelectorAll('.compare-table__unpin').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                HelioScout.Compare.unpinSite(e.currentTarget.getAttribute('data-site-id'));
                renderPinnedSidebar();
                refreshPinButton();
                if (HelioScout.Compare.getPinnedSites().length === 0) closeComparison();
                else openComparison();
            });
        });
        comparisonModal.classList.remove('hidden');
    }
    function closeComparison() { comparisonModal.classList.add('hidden'); }

    compareBtn.addEventListener('click', openComparison);
    document.getElementById('modal-close').addEventListener('click', closeComparison);
    document.getElementById('close-comparison-btn').addEventListener('click', closeComparison);
    document.getElementById('export-comparison-btn').addEventListener('click', () => HelioScout.Compare.exportCSV());
    comparisonModal.addEventListener('click', (e) => { if (e.target === comparisonModal) closeComparison(); });

    // Single-site export (current assessment -> CSV)
    document.getElementById('export-btn').addEventListener('click', () => {
        if (!currentState.currentAssessment) return;
        const rec = buildCompareRecord(currentState.currentAssessment);
        const rows = [
            ['Field', 'Value'],
            ['Name', rec.name],
            ['Latitude', rec.lat.toFixed(4)],
            ['Longitude', rec.lon.toFixed(4)],
            ['Overall Score', rec.composite],
            ['Solar GHI (kWh/m2/day)', rec.solar.ghi.toFixed(2)],
            ['PV Output (kWh/kWp/yr)', Math.round(rec.solar.pvOutput)],
            ['Solar Score', rec.solar.score],
            ['Wind Speed 100m (m/s)', rec.wind ? rec.wind.speed100m.toFixed(2) : 'n/a'],
            ['Wind Score', rec.wind ? rec.wind.score : 'n/a'],
            ['CSP DNI (kWh/m2/yr)', Math.round(rec.csp.dni)],
            ['CSP Score', rec.csp.score]
        ];
        if (rec.financial) {
            rows.push(['LCOE Solar ($/MWh)', rec.financial.lcoeSolar.toFixed(2)]);
            rows.push(['Gas Freed (MMBtu/yr)', Math.round(rec.financial.gasDisplacement)]);
            rows.push(['Gas Value Export ($M/yr)', rec.financial.gasValue.toFixed(2)]);
        }
        const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'helioscout-site-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 100);
    });

    // ==========================================
    // Fleet Validation (reconciliation)
    // ==========================================

    const fleetModal = document.getElementById('fleet-modal');
    const fleetResults = document.getElementById('fleet-results');
    const reconUtil = document.getElementById('recon-utilisation');
    const reconUtilVal = document.getElementById('recon-utilisation-val');
    const reconAmbient = document.getElementById('recon-ambient');
    const reconAmbientVal = document.getElementById('recon-ambient-val');
    const reconNational = document.getElementById('recon-national');
    let lastReconResult = null;

    function recomputeFleet() {
        const plants = HelioScout.Proposals.getPlants();
        if (!plants || plants.length === 0) {
            fleetResults.innerHTML = '<p class="text-muted">Plant data not loaded.</p>';
            return;
        }
        lastReconResult = HelioScout.Reconciliation.compute(plants, {
            utilisation: parseFloat(reconUtil.value) / 100,
            ambientC: parseFloat(reconAmbient.value),
            nationalBcf: parseFloat(reconNational.value)
        });
        fleetResults.innerHTML = HelioScout.Reconciliation.generateHTML(lastReconResult);
    }

    function openFleet() { recomputeFleet(); fleetModal.classList.remove('hidden'); }
    function closeFleet() { fleetModal.classList.add('hidden'); }

    document.getElementById('fleet-validation-btn').addEventListener('click', openFleet);
    document.getElementById('fleet-modal-close').addEventListener('click', closeFleet);
    document.getElementById('fleet-close-btn').addEventListener('click', closeFleet);
    fleetModal.addEventListener('click', (e) => { if (e.target === fleetModal) closeFleet(); });

    reconUtil.addEventListener('input', () => { reconUtilVal.textContent = reconUtil.value + '%'; recomputeFleet(); });
    reconAmbient.addEventListener('input', () => { reconAmbientVal.textContent = reconAmbient.value; recomputeFleet(); });
    reconNational.addEventListener('input', recomputeFleet);

    document.getElementById('fleet-export-btn').addEventListener('click', () => {
        if (!lastReconResult) return;
        const csv = HelioScout.Reconciliation.toCSV(lastReconResult);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'helioscout-fleet-reconciliation-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 100);
    });

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
            document.getElementById('fleet-validation-section').classList.remove('hidden');
            HelioScout.Map.toggleLayer('plants', true);
            HelioScout.Map.toggleLayer('proposed', true);
            document.getElementById('toggle-plants').querySelector('input').checked = true;
            document.getElementById('toggle-proposed').querySelector('input').checked = true;
        } else {
            els.modeBtn.classList.remove('active');
            els.modeUnivBtn.classList.add('active');
            document.getElementById('financial-tab-btn').classList.add('hidden');
            document.getElementById('fleet-validation-section').classList.add('hidden');
            // If on financial tab, switch to solar
            if (document.getElementById('tab-financial').classList.contains('active')) {
                els.tabBtns[0].click();
            }
            HelioScout.Map.toggleLayer('plants', false);
            HelioScout.Map.toggleLayer('proposed', false);
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
                HelioScout.Map.setBaseLayer(checked ? 'satellite' : 'dark');
            } else {
                HelioScout.Map.toggleLayer(layer, checked);
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
            const filtered = HelioScout.Proposals.getProposedSites(type === 'all' ? null : type);
            renderProposalsList(filtered);
        });
    });

    function renderProposalsList(sites) {
        const list = document.getElementById('proposals-list');
        list.innerHTML = '';
        sites.forEach(site => {
            list.innerHTML += HelioScout.Proposals.generateSiteCard(site);
        });
        
        // Bind assess buttons
        list.querySelectorAll('.site-card__assess').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const lat = parseFloat(e.currentTarget.getAttribute('data-lat'));
                const lon = parseFloat(e.currentTarget.getAttribute('data-lon'));
                HelioScout.Map.flyTo(lat, lon, 10);
                setTimeout(() => runAssessment(lat, lon), 1500); // Wait for flight
            });
        });
    }

    // Global listener for markers clicking "Assess Location"
    document.addEventListener('assess-proposal', (e) => {
        const { lat, lon } = e.detail;
        HelioScout.Map.getMap().closePopup();
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
                                HelioScout.Map.flyTo(lat, lon, 10);
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
