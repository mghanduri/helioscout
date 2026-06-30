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
        finNpvRange: document.getElementById('fin-npv-range'),
        finBasis: document.getElementById('fin-basis'),
        provenanceBody: document.getElementById('provenance-body'),

        // Grid-connection & delivered LCOE
        finTxCostPerKm: document.getElementById('fin-tx-cost-per-km'),
        finTxCostPerKmVal: document.getElementById('fin-tx-cost-per-km-val'),
        finGridDistance: document.getElementById('fin-grid-distance'),
        finGridVoltage: document.getElementById('fin-grid-voltage'),
        finTxCapex: document.getElementById('fin-tx-capex'),
        finLcoeAdder: document.getElementById('fin-lcoe-adder'),
        finLcoeDelivered: document.getElementById('fin-lcoe-delivered'),

        // Site feasibility (land / space constraints)
        feasBadge: document.getElementById('feas-badge'),
        feasDensity: document.getElementById('feas-density'),
        feasNote: document.getElementById('feas-note'),
        feasMaxSize: document.getElementById('feas-max-size'),
        feasMaxOutput: document.getElementById('feas-max-output')
    };

    // State
    let currentState = {
        mode: 'libya', // 'libya' or 'universal'
        currentLat: null,
        currentLon: null,
        currentAssessment: null
    };

    // 0. Load the assumptions register before anything can trigger a financial
    //    or reconciliation calculation (those engines read it at call time).
    try {
        await HelioScout.loadAssumptions();
    } catch (e) {
        console.error('Failed to load assumptions register:', e);
        alert('Could not load the assumptions register (data/assumptions.json). Financial figures will be unavailable until this loads.');
    }

    // 1. Initialize Map
    HelioScout.Map.init('map');
    HelioScout.Map.addLegend();
    window._hsMap = HelioScout.Map.getMap();

    // Map Click Handler -> Trigger Assessment
    HelioScout.Map.onMapClick((lat, lon) => {
        runAssessment(lat, lon);
    });

    // Update Coordinates Display on Mousemove
    HelioScout.Map.getMap().on('mousemove', (e) => {
        els.coordLat.textContent = `${e.latlng.lat.toFixed(4)}°${e.latlng.lat >= 0 ? 'N' : 'S'}`;
        els.coordLon.textContent = `${e.latlng.lng.toFixed(4)}°${e.latlng.lng >= 0 ? 'E' : 'W'}`;
    });

    // Source strip UTC clock
    function updateStripTime() {
        const el = document.getElementById('source-strip-time');
        if (!el) return;
        const now = new Date();
        const utc = now.toUTCString().match(/(\d\d:\d\d:\d\d)/)?.[1] || '—';
        el.textContent = `UTC ${utc} · CRS EPSG:4326 · LAST SYNC 00:14`;
    }
    updateStripTime();
    setInterval(updateStripTime, 1000);

    // Load Initial Data (Plants & Proposals)
    try {
        await HelioScout.Proposals.loadData();
        const plants = HelioScout.Proposals.getPlants();
        const proposals = HelioScout.Proposals.getProposedSites(null);
        
        HelioScout.Map.renderPlants(plants);
        HelioScout.Map.renderProposedSites(proposals);

        renderProposalsList(proposals);

    } catch (e) {
        console.error("Failed to load initial data:", e);
    }

    // Load the existing transmission network (renders itself via Map.renderTransmission).
    if (HelioScout.Transmission) {
        HelioScout.Transmission.load().catch((e) =>
            console.error('Failed to load transmission network:', e)
        );
    }
    // Render labelled population centres from the population grid's city list.
    if (HelioScout.PopulationOverlay) {
        // The grid + cities load asynchronously; poll briefly until ready, then render.
        let centreTries = 0;
        const renderCentres = () => {
            const g = HelioScout.PopulationOverlay.getGrid();
            if (g && g.cities && g.cities.length) {
                HelioScout.Map.renderPopulationCentres(g.cities);
            } else if (centreTries++ < 25) {
                setTimeout(renderCentres, 400);
            }
        };
        renderCentres();
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
        // Expose the last assessed coordinate so the "Add point of interest"
        // form (js/personalization.js) can prefill it.
        window._hsLastClick = { lat: lat, lon: lon };

        // Check bounds if in Libya mode
        if (currentState.mode === 'libya') {
            if (lat < 19 || lat > 34 || lon < 9 || lon > 25) {
                alert("Location is outside Libya. Please switch to Universal Mode to assess locations worldwide.");
                return;
            }
        }

        // Show loading state in right rail
        const emptyEl = document.getElementById('assessment-empty');
        if (emptyEl) emptyEl.classList.add('hidden');
        els.loadingOverlay.classList.remove('hidden');
        els.contentOverlay.classList.add('hidden');

        // Fetch assessment data from backend (handle failures gracefully).
        let assessment = null;
        try {
            assessment = await HelioScout.API.fetchAllData(lat, lon);
        } catch (err) {
            console.error('Assessment request failed:', err);
            assessment = null;
        }
        if (!assessment) {
            els.loadingOverlay.classList.add('hidden');
            if (emptyEl) emptyEl.classList.remove('hidden');
            els.contentOverlay.classList.add('hidden');
            return; // Aborted or failed
        }
        
        currentState.currentAssessment = assessment;
        
        // Update Map Marker
        HelioScout.Map.placeMarker(lat, lon, assessment.overallScore);
        
        // Reverse geocode via the backend proxy. Show an honest, coordinate-based
        // label when the location can't be resolved rather than a fabricated name.
        els.locationName.textContent = 'Resolving location…';
        HelioScout.API.reverseGeocode(lat, lon).then(name => {
            els.locationName.textContent = name || `Unnamed location (${lat.toFixed(3)}°, ${lon.toFixed(3)}°)`;
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
        HelioScout.Charts.renderMonthlyChart(
            'monthly-chart',
            (assessment.solar && assessment.solar.monthlyProfile) ? assessment.solar.monthlyProfile : null,
            null
        );
        HelioScout.Charts.renderRadarChart('radar-chart', {
            solar: assessment.solar ? assessment.solar.score : 0,
            wind: assessment.wind ? assessment.wind.score : 0,
            csp: assessment.csp ? assessment.csp.score : 0
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

    // Status dot label for a per-source availability state.
    function statusLabel(status) {
        if (status === 'ok') return '<span class="prov-status prov-ok">● live</span>';
        if (status === 'unavailable') return '<span class="prov-status prov-bad">● unavailable</span>';
        return `<span class="prov-status">● ${status || '—'}</span>`;
    }

    // Render the "Data sources & assumptions" panel from the backend provenance
    // block so every figure is traceable to a named dataset, version and as-of date.
    function renderProvenance(data) {
        if (!els.provenanceBody) return;
        const p = data.provenance;
        if (!p) { els.provenanceBody.innerHTML = '<p class="text-muted">Provenance unavailable.</p>'; return; }

        const a = HelioScout.Assumptions;
        const ds = p.datasets || {};
        const retrieved = p.retrievedAt ? new Date(p.retrievedAt).toLocaleString() : '—';

        const nameVer = (o) => o ? [o.name, o.version, o.dataset].filter(Boolean).join(' · ') : '—';

        let html = '';
        html += '<dl class="prov-list">';
        html += `<dt>Solar resource</dt><dd>${nameVer(ds.solar && ds.solar.resource)} ${statusLabel(p.status && p.status.nasa)}</dd>`;
        html += `<dt>PV yield</dt><dd>${nameVer(ds.solar && ds.solar.pvYield)} ${statusLabel(p.status && p.status.pvgis)}</dd>`;
        html += `<dt>Wind</dt><dd>${nameVer(ds.wind && ds.wind.resource)} ${statusLabel(p.status && p.status.meteo)}</dd>`;
        html += `<dt>CSP (DNI)</dt><dd>${nameVer(ds.csp && ds.csp.resource)}</dd>`;
        if (ds.live && ds.live.weather) {
            const snap = ds.live.snapshot || {};
            const snapParts = [];
            if (snap.temperatureC != null) snapParts.push(`Temp ${snap.temperatureC.toFixed(1)}°C`);
            if (snap.wind10mMs != null) snapParts.push(`Wind ${snap.wind10mMs.toFixed(1)} m/s`);
            if (snap.shortwaveWm2 != null) snapParts.push(`SW ${Math.round(snap.shortwaveWm2)} W/m²`);
            const snapText = snapParts.length ? ` (${snapParts.join(' · ')})` : '';
            html += `<dt>Live weather</dt><dd>${nameVer(ds.live.weather)}${snapText} ${statusLabel(p.status && p.status.live)}</dd>`;
        }
        html += `<dt>Assumptions register</dt><dd>v${p.assumptionsVersion || '—'} (updated ${p.assumptionsUpdated || '—'})</dd>`;
        html += `<dt>Retrieved</dt><dd>${retrieved}</dd>`;
        html += '</dl>';

        // Threshold bases (1.4) — why the score bands are what they are.
        const basis = p.thresholdBasis || (a && a.scoring && a.scoring._basis);
        if (basis) {
            html += '<div class="prov-basis"><strong>Scoring threshold basis</strong><ul>';
            if (basis.solarGHIBands) html += `<li><em>Solar GHI bands:</em> ${basis.solarGHIBands}</li>`;
            if (basis.windV100Bands) html += `<li><em>Wind classes:</em> ${basis.windV100Bands}</li>`;
            if (basis.cspDNIBands) html += `<li><em>CSP DNI bands:</em> ${basis.cspDNIBands}</li>`;
            html += '</ul></div>';
        }

        html += '<p class="prov-note text-muted">Financial figures derive from the dated assumptions register. Values marked “UNSOURCED” there are unverified and must be confirmed by the assumptions owner before official use.</p>';

        els.provenanceBody.innerHTML = html;
    }

    function populateUI(data) {
        const solar = data.solar || null;
        const wind = data.wind || null;
        const csp = data.csp || null;

        // Overall score display (hidden ring kept for compat)
        const scoreCircle = Math.round(327 - (327 * data.overallScore / 100));
        els.scoreRingFill.style.strokeDashoffset = scoreCircle;
        let ringColor = '#ef4444';
        if (data.overallScore >= 80) ringColor = '#10b981';
        else if (data.overallScore >= 60) ringColor = '#f59e0b';
        els.scoreRingFill.style.stroke = ringColor;
        els.scoreRingValue.textContent = data.overallScore;

        // Grade letter + score bar (Federal Analytical design)
        const grade = data.overallScore >= 90 ? 'A' : data.overallScore >= 80 ? 'B' : data.overallScore >= 70 ? 'C' : data.overallScore >= 60 ? 'D' : 'F';
        const gradeEl = document.getElementById('grade-letter');
        if (gradeEl) gradeEl.textContent = grade;
        const barEl = document.getElementById('score-bar-fill');
        if (barEl) barEl.style.width = `${data.overallScore}%`;

        // Score rating text + color
        const ratingColor = data.overallScore >= 80 ? '#1f9d6b' : data.overallScore >= 60 ? '#d99a16' : '#c0392b';
        const ratingLabel = data.overallScore >= 80 ? 'High suitability' : data.overallScore >= 60 ? 'Moderate suitability' : 'Low suitability';
        els.recText.textContent = ratingLabel;
        els.recText.style.color = ratingColor;
        document.getElementById('grade-letter').style.color = ratingColor;
        document.getElementById('grade-box').style.borderColor = ratingColor;
        if (barEl) barEl.style.background = ratingColor;

        // Provenance / data sources panel
        renderProvenance(data);

        // Solar Tab
        els.metricGhi.textContent = solar && solar.ghi ? solar.ghi.annual.toFixed(2) : '—';
        els.metricPvOut.textContent = (solar && solar.pvOutput != null) ? solar.pvOutput.toFixed(0) : 'N/A';
        els.metricSolarCf.textContent = (solar && solar.capacityFactor != null) ? solar.capacityFactor.toFixed(1) : '—';
        els.metricTilt.textContent = (solar && solar.optimalTilt != null) ? Math.round(solar.optimalTilt) : '—';
        els.metricTemp.textContent = (solar && solar.avgTemp != null) ? solar.avgTemp.toFixed(1) : '—';
        els.metricTempImpact.textContent = solar ? solar.tempImpact : 'Unavailable';
        els.metricTempImpactDesc.textContent = solar ? solar.tempDesc : 'Core solar climatology unavailable for this assessment.';
        
        els.solarScoreBar.style.width = `${solar ? solar.score : 0}%`;
        els.solarScoreValue.textContent = solar ? solar.score : '0';
        els.solarRating.textContent = solar ? solar.rating : 'Insufficient Data';
        els.solarRating.style.color = solar ? solar.color : '#8595a4';

        // Wind Tab
        if (wind) {
            els.metricWind100.textContent = wind.v100.toFixed(2);
            els.metricWpd.textContent = wind.wpd.toFixed(0);
            els.metricWindClass.textContent = wind.windClassDesc.split('(')[0].trim();
            els.metricWindClassDesc.textContent = wind.windClassDesc;
            els.metricWindCf.textContent = wind.estimatedCF.toFixed(1);
            els.metricWind50.textContent = wind.v50.toFixed(2);
            els.metricWind10.textContent = wind.v10.toFixed(2);
            
            els.windScoreBar.style.width = `${wind.score}%`;
            els.windScoreValue.textContent = wind.score;
            els.windRating.textContent = wind.rating;
            els.windRating.style.color = wind.color;
        } else {
            // Null state
            els.metricWind100.textContent = '—';
            els.windScoreBar.style.width = '0%';
            els.windScoreValue.textContent = '0';
            els.windRating.textContent = 'Insufficient Data';
        }

        // CSP Tab
        els.metricDni.textContent = csp ? csp.dniDaily.toFixed(2) : '—';
        els.metricDniAnnual.textContent = csp ? Math.round(csp.dniAnnual).toLocaleString() : '—';
        els.metricCspSuit.textContent = csp ? csp.suitability : 'Insufficient Data';

        els.cspScoreBar.style.width = `${csp ? csp.score : 0}%`;
        els.cspScoreValue.textContent = csp ? csp.score : '0';
        els.cspRating.textContent = csp ? csp.suitability : 'Insufficient Data';
        els.cspRating.style.color = csp ? csp.color : '#8595a4';
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

        // NPV sensitivity to export gas price (low / expected / high) — a range,
        // not a single point, since gas price is the dominant driver.
        if (els.finNpvRange) {
            const sens = HelioScout.Financial.calculateNPVSensitivity({
                capex: pvLcoe.totalCapex,
                annualOpex: pvLcoe.annualOpex,
                gasFreedMMBtu: disp.gasFreedMMBtu,
                exportPrice: expPrice,
                lifeYears: 25
            });
            const m = (v) => (v >= 0 ? '+$' : '−$') + Math.abs(v / 1e6).toFixed(1) + 'M';
            const pctLabel = Math.round(sens.pct * 100);
            els.finNpvRange.textContent =
                `Range (export price ±${pctLabel}%): ${m(sens.low)} … ${m(sens.high)}`;
        }

        // ── Grid connection & delivered LCOE ──────────────────────────────
        // Distance to the existing transmission network sets the new-line cost,
        // which we annualise and add to the bare-generation LCOE.
        let tx = null, grid = null;
        if (HelioScout.Transmission && HelioScout.Transmission.isReady()) {
            grid = HelioScout.Transmission.getNearestTransmission(
                currentState.currentLat, currentState.currentLon
            );
        }
        if (grid) {
            const costPerKm = els.finTxCostPerKm
                ? parseFloat(els.finTxCostPerKm.value)
                : HelioScout.Financial.txCostPerKmFor(grid.voltage);
            tx = HelioScout.Financial.calculateTransmission({
                distanceKm: grid.distanceKm,
                voltage: grid.voltage,
                costPerKm: costPerKm,
                annualMWh: pvLcoe.annualMWh,
                lcoeBase: pvLcoe.lcoe
            });

            if (els.finGridDistance) els.finGridDistance.textContent = grid.distanceKm.toFixed(1);
            if (els.finGridVoltage) els.finGridVoltage.textContent = grid.voltage ? grid.voltage + ' kV' : 'n/a';
            if (els.finTxCapex) els.finTxCapex.textContent = '$' + (tx.transmissionCapex / 1e6).toFixed(1) + 'M';
            if (els.finLcoeAdder) els.finLcoeAdder.textContent = '+' + tx.lcoeAdder.toFixed(2);
            if (els.finLcoeDelivered) els.finLcoeDelivered.textContent = tx.lcoeDelivered.toFixed(2);
        }

        // ── Site feasibility (land / space constraints) ───────────────────
        let feas = null, popDensity = null, sizing = null;
        if (HelioScout.PopulationOverlay) {
            popDensity = HelioScout.PopulationOverlay.sampleAt(
                currentState.currentLat, currentState.currentLon
            );
        }
        if (popDensity != null) {
            feas = HelioScout.Financial.classifyFeasibility(popDensity);
            // Indicative max size for a nominal 10 km² open parcel at this site.
            sizing = HelioScout.Financial.estimateFarmSize({
                availableAreaKm2: 10,
                capacityFactorPercent: a.solar.capacityFactor
            });

            if (els.feasBadge) {
                els.feasBadge.textContent = feas.label;
                els.feasBadge.className = 'feas-badge feas-badge--' + feas.level;
            }
            if (els.feasDensity) els.feasDensity.textContent = Math.round(popDensity).toLocaleString();
            if (els.feasNote) els.feasNote.textContent = feas.note;
            const suppress = feas.level === 'infeasible';
            if (els.feasMaxSize) els.feasMaxSize.textContent = suppress ? '—' : Math.round(sizing.maxCapacityMW).toLocaleString();
            if (els.feasMaxOutput) els.feasMaxOutput.textContent = suppress ? '—' : sizing.annualOutputGWh.toFixed(0);
        }

        // Cache a compact summary for the Compare feature
        currentState.financialSummary = {
            lcoeSolar: pvLcoe.lcoe,
            gasDisplacement: disp.gasFreedMMBtu,   // MMBtu/yr
            gasValue: disp.exportValue / 1e6,       // $M/yr (export-parity)
            npv: npv.npv,
            paybackYears: npv.paybackYears,
            gridDistanceKm: grid ? grid.distanceKm : null,
            gridVoltage: grid ? grid.voltage : null,
            transmissionCapex: tx ? tx.transmissionCapex : null,
            lcoeDelivered: tx ? tx.lcoeDelivered : null,
            feasibility: feas ? feas.level : null,
            popDensity: popDensity
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
                gasValue: fin.gasValue,
                lcoeDelivered: fin.lcoeDelivered,
                gridDistanceKm: fin.gridDistanceKm,
                transmissionCapex: fin.transmissionCapex,
                feasibility: fin.feasibility
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

        // Persist the pin set for a signed-in user (no-op when anonymous).
        if (HelioScout.Personalization) HelioScout.Personalization.syncPins();
    }
    HelioScout.Compare.onUpdate = renderPinnedSidebar;

    // Recompute financials when a personalization change (e.g. an edited heat
    // rate) requests it. Guarded so it only runs with an active assessment.
    document.addEventListener('helioscout:recalc-financials', function () {
        if (currentState.currentAssessment && currentState.mode === 'libya') updateFinancials();
    });

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
            if (rec.financial.gridDistanceKm != null)
                rows.push(['Distance to Grid (km)', rec.financial.gridDistanceKm.toFixed(1)]);
            if (rec.financial.lcoeDelivered != null)
                rows.push(['Delivered LCOE ($/MWh)', rec.financial.lcoeDelivered.toFixed(2)]);
            if (rec.financial.transmissionCapex != null)
                rows.push(['Connection CapEx ($M)', (rec.financial.transmissionCapex / 1e6).toFixed(1)]);
            if (rec.financial.feasibility)
                rows.push(['Land Feasibility', rec.financial.feasibility]);
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

    // New-line cost slider ($/km) for the delivered-LCOE calculation.
    if (els.finTxCostPerKm) {
        els.finTxCostPerKm.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            if (els.finTxCostPerKmVal) {
                els.finTxCostPerKmVal.textContent = '$' + Math.round(v / 1000) + 'k/km';
            }
            updateFinancials();
        });
    }

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
        const countEl = document.getElementById('proposals-count');
        if (countEl) countEl.textContent = sites.length;

        const typeLabels = { solar: 'Solar PV', wind: 'Wind', hybrid: 'Hybrid', csp: 'CSP' };
        const typeColors = { solar: '#b5560f', wind: '#1f6fb2', hybrid: '#7a5cb2', csp: '#c08a16' };

        list.innerHTML = sites.map(site => {
            const color = typeColors[site.type] || '#8595a4';
            const label = typeLabels[site.type] || site.type;
            return `<div class="site-row">
                <div class="site-row-name">${site.name}</div>
                <div><span class="site-type-chip" style="color:${color}">${label}</span></div>
                <div style="text-align:right">${site.estimatedCapacityMW} MW</div>
                <div style="text-align:right">—</div>
                <div style="text-align:right">—</div>
                <div style="text-align:right">—</div>
                <div style="text-align:right">—</div>
                <div style="text-align:right"><button class="site-row-assess site-card__assess" data-lat="${site.lat}" data-lon="${site.lon}">Assess →</button></div>
            </div>`;
        }).join('');

        list.querySelectorAll('.site-card__assess').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const lat = parseFloat(e.currentTarget.getAttribute('data-lat'));
                const lon = parseFloat(e.currentTarget.getAttribute('data-lon'));
                HelioScout.Map.flyTo(lat, lon, 10);
                setTimeout(() => runAssessment(lat, lon), 1500);
            });
        });
    }

    // Global listener for markers clicking "Assess Location"
    document.addEventListener('assess-proposal', (e) => {
        const { lat, lon } = e.detail;
        HelioScout.Map.getMap().closePopup();
        runAssessment(lat, lon);
    });

    // Geocoding search via the backend proxy (Nominatim called server-side).
    let searchTimeout;
    els.searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        if (query.length < 3) {
            els.searchResults.classList.add('hidden');
            return;
        }

        searchTimeout = setTimeout(() => {
            HelioScout.API.searchPlace(query).then(results => {
                els.searchResults.innerHTML = '';
                if (!results.length) {
                    els.searchResults.innerHTML = '<div class="search-result-item text-muted">No results found</div>';
                } else {
                    results.forEach(item => {
                        const div = document.createElement('div');
                        div.className = 'search-result-item';
                        div.textContent = item.displayName;
                        div.addEventListener('click', () => {
                            els.searchResults.classList.add('hidden');
                            els.searchInput.value = item.displayName.split(',')[0];
                            HelioScout.Map.flyTo(item.lat, item.lon, 10);
                            setTimeout(() => runAssessment(item.lat, item.lon), 1500);
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
