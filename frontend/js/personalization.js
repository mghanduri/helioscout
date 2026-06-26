/**
 * HelioScout.Personalization — wires the four per-user features to the backend.
 *
 *   1. Points of interest   — custom map markers (CRUD via /api/me/pois)
 *   2. Heat-rate overrides   — per-turbine ISO heat rate (/api/me/heat-rates)
 *   3. Pinned comparisons    — persists the Compare set (/api/me/pins)
 *   4. Financial defaults    — preferred slider/turbine values (/api/me/financial-defaults)
 *
 * Everything is gated on sign-in: when signed out, the personalization UI is
 * hidden, overrides are cleared, and the app behaves exactly as the anonymous
 * default. State is driven by the 'helioscout:auth-change' event from auth.js.
 */
window.HelioScout = window.HelioScout || {};

HelioScout.Personalization = (function () {
    'use strict';

    var TYPE_COLORS = {
        solar: '#b5560f', wind: '#1f6fb2', hybrid: '#7a5cb2', csp: '#c08a16', other: '#103a63'
    };

    var pois = [];
    var poiLayer = null;
    var pinKnown = new Set();   // site_ids currently persisted on the backend

    function auth() { return HelioScout.Auth; }
    function signedIn() { return auth() && auth().isSignedIn(); }
    function getMap() { return window._hsMap || null; }
    function recalcFinancials() {
        document.dispatchEvent(new CustomEvent('helioscout:recalc-financials'));
    }

    /* ───────── Points of interest ───────── */

    function ensurePoiLayer() {
        var map = getMap();
        if (!map || !window.L) return null;
        if (!poiLayer) poiLayer = window.L.layerGroup().addTo(map);
        return poiLayer;
    }

    function renderPoiMarkers() {
        var layer = ensurePoiLayer();
        if (!layer) return;
        layer.clearLayers();
        pois.forEach(function (p) {
            var color = TYPE_COLORS[p.type] || TYPE_COLORS.other;
            var marker = window.L.circleMarker([p.lat, p.lon], {
                radius: 7, color: color, weight: 2, fillColor: color, fillOpacity: 0.35
            });
            var html = '<div class="poi-popup"><strong>' + escapeHtml(p.name) + '</strong>' +
                '<div class="poi-popup-meta">' + (p.type || 'other') + ' · ' +
                p.lat.toFixed(3) + '°, ' + p.lon.toFixed(3) + '°</div>' +
                (p.notes ? '<div class="poi-popup-notes">' + escapeHtml(p.notes) + '</div>' : '') +
                '<button class="poi-popup-del" data-poi-id="' + p.id + '">Delete</button></div>';
            marker.bindPopup(html);
            marker.on('popupopen', function (e) {
                var btn = e.popup.getElement().querySelector('.poi-popup-del');
                if (btn) btn.addEventListener('click', function () { deletePoi(p.id); map_closePopup(); });
            });
            layer.addLayer(marker);
        });
    }

    function map_closePopup() { var m = getMap(); if (m) m.closePopup(); }

    function renderPoiList() {
        var list = document.getElementById('poi-list');
        if (!list) return;
        if (!pois.length) {
            list.innerHTML = '<div class="poi-empty">No saved points yet.</div>';
            return;
        }
        list.innerHTML = pois.map(function (p) {
            var color = TYPE_COLORS[p.type] || TYPE_COLORS.other;
            return '<div class="poi-item" data-poi-id="' + p.id + '">' +
                '<span class="poi-dot" style="background:' + color + '"></span>' +
                '<span class="poi-item-name" data-lat="' + p.lat + '" data-lon="' + p.lon + '">' +
                    escapeHtml(p.name) + '</span>' +
                '<button class="poi-item-del" data-poi-id="' + p.id + '" title="Remove">✕</button>' +
            '</div>';
        }).join('');

        list.querySelectorAll('.poi-item-name').forEach(function (el) {
            el.addEventListener('click', function () {
                var lat = parseFloat(el.getAttribute('data-lat'));
                var lon = parseFloat(el.getAttribute('data-lon'));
                if (HelioScout.Map && HelioScout.Map.flyTo) HelioScout.Map.flyTo(lat, lon, 10);
            });
        });
        list.querySelectorAll('.poi-item-del').forEach(function (btn) {
            btn.addEventListener('click', function () { deletePoi(btn.getAttribute('data-poi-id')); });
        });
    }

    function renderPois() { renderPoiMarkers(); renderPoiList(); }

    function loadPois() {
        return auth().api('/api/me/pois').then(function (data) {
            pois = data.pois || [];
            renderPois();
        }).catch(function (e) { console.error('[personalization] load POIs failed:', e); });
    }

    function addPoi(poi) {
        return auth().api('/api/me/pois', { method: 'POST', body: poi }).then(function (data) {
            pois.unshift(data.poi);
            renderPois();
            return data.poi;
        });
    }

    function deletePoi(id) {
        return auth().api('/api/me/pois/' + id, { method: 'DELETE' }).then(function () {
            pois = pois.filter(function (p) { return String(p.id) !== String(id); });
            renderPois();
        }).catch(function (e) { console.error('[personalization] delete POI failed:', e); });
    }

    /* ───────── Heat-rate overrides ───────── */

    function loadHeatRates() {
        return auth().api('/api/me/heat-rates').then(function (data) {
            HelioScout.Financial.setHeatRateOverrides(data.heatRates || {});
            refreshHeatRateControl();
            recalcFinancials();
        }).catch(function (e) { console.error('[personalization] load heat rates failed:', e); });
    }

    // Sync the editable control to the currently selected turbine.
    function refreshHeatRateControl() {
        var sel = document.getElementById('fin-turbine');
        var input = document.getElementById('fin-heatrate');
        var state = document.getElementById('fin-heatrate-state');
        if (!sel || !input || !HelioScout.Financial) return;
        var id = sel.value;
        var override = HelioScout.Financial.getHeatRateOverride(id);
        var def = HelioScout.Financial.getDefaultHeatRate(id);
        input.value = override != null ? override : (def != null ? def : '');
        if (state) {
            state.textContent = override != null ? 'custom' : 'register';
            state.style.color = override != null ? 'var(--primary)' : 'var(--text-faint)';
        }
    }

    function saveHeatRate(turbineId, value) {
        return auth().api('/api/me/heat-rates/' + turbineId, {
            method: 'PUT', body: { isoHeatRate: value }
        }).then(function () {
            HelioScout.Financial.setHeatRateOverride(turbineId, value);
            refreshHeatRateControl();
            recalcFinancials();
        });
    }

    function resetHeatRate(turbineId) {
        return auth().api('/api/me/heat-rates/' + turbineId, { method: 'DELETE' }).then(function () {
            HelioScout.Financial.setHeatRateOverride(turbineId, null);
            refreshHeatRateControl();
            recalcFinancials();
        });
    }

    /* ───────── Pinned comparisons ───────── */

    function loadPins() {
        return auth().api('/api/me/pins').then(function (data) {
            var pins = data.pins || [];
            pinKnown = new Set(pins.map(function (p) { return p.id; }));
            if (HelioScout.Compare && HelioScout.Compare.setPinnedSites) {
                HelioScout.Compare.setPinnedSites(pins);
                if (HelioScout.Compare.onUpdate) HelioScout.Compare.onUpdate();
            }
        }).catch(function (e) { console.error('[personalization] load pins failed:', e); });
    }

    // Reconcile the backend with the current in-memory pin set (idempotent).
    // Called by the app after any pin/unpin; a no-op when signed out.
    function syncPins(currentSites) {
        if (!signedIn()) return;
        var current = currentSites || (HelioScout.Compare ? HelioScout.Compare.getPinnedSites() : []);
        var currentIds = new Set(current.map(function (s) { return s.id; }));

        current.forEach(function (s) {
            if (!pinKnown.has(s.id)) {
                pinKnown.add(s.id);
                auth().api('/api/me/pins/' + encodeURIComponent(s.id), {
                    method: 'PUT', body: { payload: s }
                }).catch(function (e) { console.error('[personalization] save pin failed:', e); });
            }
        });
        Array.from(pinKnown).forEach(function (id) {
            if (!currentIds.has(id)) {
                pinKnown.delete(id);
                auth().api('/api/me/pins/' + encodeURIComponent(id), { method: 'DELETE' })
                    .catch(function (e) { console.error('[personalization] delete pin failed:', e); });
            }
        });
    }

    /* ───────── Financial defaults ───────── */

    var DEFAULT_FIELDS = [
        { id: 'fin-capacity', key: 'capacity', event: 'input' },
        { id: 'fin-age', key: 'age', event: 'input' },
        { id: 'fin-domestic-price', key: 'domPrice', event: 'input' },
        { id: 'fin-export-price', key: 'expPrice', event: 'input' },
        { id: 'fin-turbine', key: 'turbine', event: 'change' },
        { id: 'fin-tx-cost-per-km', key: 'txCostPerKm', event: 'input' }
    ];

    function loadFinancialDefaults() {
        return auth().api('/api/me/financial-defaults').then(function (data) {
            if (data.defaults) applyFinancialDefaults(data.defaults);
        }).catch(function (e) { console.error('[personalization] load financial defaults failed:', e); });
    }

    function applyFinancialDefaults(d) {
        DEFAULT_FIELDS.forEach(function (f) {
            if (d[f.key] == null) return;
            var el = document.getElementById(f.id);
            if (!el) return;
            el.value = d[f.key];
            // Fire the same event the app listens to so labels + calcs update.
            el.dispatchEvent(new Event(f.event, { bubbles: true }));
        });
        refreshHeatRateControl();
    }

    function readFinancialDefaults() {
        var out = {};
        DEFAULT_FIELDS.forEach(function (f) {
            var el = document.getElementById(f.id);
            if (el) out[f.key] = el.value;
        });
        return out;
    }

    function saveFinancialDefaults() {
        var status = document.getElementById('fin-defaults-status');
        return auth().api('/api/me/financial-defaults', {
            method: 'PUT', body: { payload: readFinancialDefaults() }
        }).then(function () {
            if (status) { status.textContent = 'Saved to your profile.'; status.style.color = 'var(--good)'; }
        }).catch(function (e) {
            if (status) { status.textContent = 'Could not save: ' + e.message; status.style.color = 'var(--bad)'; }
        });
    }

    /* ───────── sign-in / sign-out orchestration ───────── */

    function togglePersonalUI(show) {
        ['poi-section', 'fin-heatrate-row', 'fin-defaults-row'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.classList.toggle('hidden', !show);
        });
    }

    function onSignIn() {
        togglePersonalUI(true);
        loadPois();
        loadHeatRates();
        loadPins();
        loadFinancialDefaults();
    }

    function onSignOut() {
        togglePersonalUI(false);
        // Clear POIs from the map + list.
        pois = [];
        if (poiLayer) poiLayer.clearLayers();
        renderPoiList();
        // Drop heat-rate overrides → revert to register values.
        if (HelioScout.Financial) HelioScout.Financial.setHeatRateOverrides({});
        recalcFinancials();
        // Clear the (now personal) pin set from view.
        pinKnown = new Set();
        if (HelioScout.Compare && HelioScout.Compare.setPinnedSites) {
            HelioScout.Compare.setPinnedSites([]);
            if (HelioScout.Compare.onUpdate) HelioScout.Compare.onUpdate();
        }
    }

    /* ───────── form wiring ───────── */

    function wirePoiForm() {
        var addBtn = document.getElementById('poi-add-btn');
        var form = document.getElementById('poi-form');
        var cancel = document.getElementById('poi-cancel');
        var nameEl = document.getElementById('poi-name');
        var typeEl = document.getElementById('poi-type');
        var latEl = document.getElementById('poi-lat');
        var lonEl = document.getElementById('poi-lon');
        var errEl = document.getElementById('poi-form-error');
        if (!form) return;

        addBtn.addEventListener('click', function () {
            form.classList.remove('hidden');
            addBtn.classList.add('hidden');
            if (errEl) errEl.textContent = '';
            // Prefill from the last clicked/assessed coordinate, else map centre.
            var last = window._hsLastClick;
            if (last) { latEl.value = last.lat.toFixed(4); lonEl.value = last.lon.toFixed(4); }
            else if (getMap()) { var c = getMap().getCenter(); latEl.value = c.lat.toFixed(4); lonEl.value = c.lng.toFixed(4); }
            nameEl.focus();
        });

        function hideForm() {
            form.classList.add('hidden');
            addBtn.classList.remove('hidden');
            form.reset();
            if (errEl) errEl.textContent = '';
        }
        cancel.addEventListener('click', hideForm);

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (errEl) errEl.textContent = '';
            var name = (nameEl.value || '').trim();
            var lat = parseFloat(latEl.value);
            var lon = parseFloat(lonEl.value);
            if (!name) { if (errEl) errEl.textContent = 'Name is required.'; return; }
            if (!isFinite(lat) || lat < -90 || lat > 90 || !isFinite(lon) || lon < -180 || lon > 180) {
                if (errEl) errEl.textContent = 'Enter valid coordinates.'; return;
            }
            addPoi({ name: name, lat: lat, lon: lon, type: typeEl.value })
                .then(hideForm)
                .catch(function (err) { if (errEl) errEl.textContent = err.message || 'Could not save point.'; });
        });
    }

    function wireFinanceControls() {
        var input = document.getElementById('fin-heatrate');
        var reset = document.getElementById('fin-heatrate-reset');
        var sel = document.getElementById('fin-turbine');
        var save = document.getElementById('fin-save-defaults');

        if (input) input.addEventListener('change', function () {
            var v = parseFloat(input.value);
            if (!isFinite(v) || v <= 0) { refreshHeatRateControl(); return; }
            saveHeatRate(sel.value, v).catch(function (e) {
                console.error('[personalization] save heat rate failed:', e);
                refreshHeatRateControl();
            });
        });
        if (reset) reset.addEventListener('click', function () {
            resetHeatRate(sel.value).catch(function (e) { console.error(e); });
        });
        // Keep the heat-rate control in sync when the displaced turbine changes.
        if (sel) sel.addEventListener('change', refreshHeatRateControl);
        if (save) save.addEventListener('click', saveFinancialDefaults);
    }

    /* ───────── helpers ───────── */

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /* ───────── init ───────── */

    document.addEventListener('DOMContentLoaded', function () {
        wirePoiForm();
        wireFinanceControls();
        document.addEventListener('helioscout:auth-change', function (e) {
            if (e.detail && e.detail.signedIn) onSignIn();
            else onSignOut();
        });
    });

    return {
        syncPins: syncPins,
        refreshHeatRateControl: refreshHeatRateControl,
        addPoi: addPoi,
        deletePoi: deletePoi,
        getPois: function () { return pois.slice(); }
    };
})();
