window.HelioScout = window.HelioScout || {};

/**
 * HelioScout.Reconciliation — Fleet heat-rate validation.
 *
 * Builds a bottom-up estimate of national gas-to-power consumption from the
 * GECOL thermal fleet (per-plant derived heat rate x assumed utilisation) and
 * reconciles it against an independent published national figure. If the two
 * agree within a sensible margin, the per-plant heat-rate methodology is
 * empirically validated rather than merely asserted — the move that turns an
 * estimate into a defensible one in front of a technical panel.
 */
HelioScout.Reconciliation = (function () {

    // All reconciliation constants come from the dated, sourced assumptions
    // register (assumptions.json, reconciliation section), loaded by
    // js/assumptions.js. Read at call time so the register stays authoritative.
    function recon() {
        return HelioScout.requireAssumptions().reconciliation;
    }

    /**
     * Compute the bottom-up fleet gas estimate.
     * @param {Array} plants — libya-plants.json records
     * @param {{utilisation:number, ambientC:number, nationalBcf:number}} opts
     */
    function compute(plants, opts) {
        opts = opts || {};
        var R = recon();
        var MMBTU_PER_BCF = R.mmbtuPerBcf;
        var utilisation = opts.utilisation != null ? opts.utilisation : R.utilisation;
        var ambientC = opts.ambientC != null ? opts.ambientC : R.defaultAmbientC;
        var nationalBcf = opts.nationalBcf != null ? opts.nationalBcf : R.nationalBcf.value;
        var currentYear = new Date().getFullYear();

        var rows = [];
        var totalMMBtu = 0;
        var totalCapacityMW = 0;

        plants.forEach(function (p) {
            // Only gas-fired thermal plants displace gas; skip anything else.
            var fuel = (p.fuel || '').toLowerCase();
            if (fuel.indexOf('gas') === -1 && fuel.indexOf('oil') === -1 && fuel.indexOf('crude') === -1) {
                return;
            }

            var turbineId = HelioScout.Financial.classConfigToTurbineId(p.turbineClass, p.config);
            var turbine = HelioScout.Financial.getTurbineById(turbineId);
            var ageYears = p.yearBuilt ? Math.max(0, currentYear - p.yearBuilt) : 20;

            // Derived (derated) heat rate, BTU/kWh
            var heatRate = HelioScout.Financial.deriveFleetHeatRate(turbine.isoHeatRate, ambientC, ageYears, turbine.config);

            var annualMWh = p.capacityMW * 8760 * utilisation;
            var gasMMBtu = annualMWh * 1000 * heatRate / 1e6;

            totalMMBtu += gasMMBtu;
            totalCapacityMW += p.capacityMW;

            rows.push({
                name: p.name,
                capacityMW: p.capacityMW,
                config: p.config,
                turbineClass: p.turbineClass || '—',
                heatRate: heatRate,
                annualGWh: annualMWh / 1000,
                gasBcf: gasMMBtu / MMBTU_PER_BCF
            });
        });

        var fleetBcf = totalMMBtu / MMBTU_PER_BCF;
        var ratio = nationalBcf > 0 ? fleetBcf / nationalBcf : 0;
        var validated = ratio >= R.validationBand.low && ratio <= R.validationBand.high;

        return {
            rows: rows,
            totalCapacityMW: totalCapacityMW,
            fleetMMBtu: totalMMBtu,
            fleetBcf: fleetBcf,
            nationalBcf: nationalBcf,
            ratio: ratio,
            validated: validated,
            utilisation: utilisation,
            ambientC: ambientC
        };
    }

    /**
     * Build the results HTML (verdict + summary + per-plant table).
     */
    function generateHTML(result) {
        var verdictClass = result.validated ? 'is-validated' : 'is-off';
        var verdictText = result.validated
            ? 'Bottom-up fleet estimate reconciles with the national figure within ±25% — the per-plant heat-rate methodology is validated against independent data.'
            : 'Bottom-up estimate diverges from the national figure. Adjust fleet utilisation (the key unknown) or the national reference to investigate the gap.';

        var html = '';

        html += '<div class="recon-verdict ' + verdictClass + '">' +
            '<span class="recon-verdict__ratio">' + (result.ratio * 100).toFixed(0) + '%</span>' +
            '<span class="recon-verdict__text">' + verdictText + '</span>' +
            '</div>';

        html += '<div class="recon-summary">' +
            '<div class="recon-summary__item"><span class="label">Bottom-up fleet gas</span><span class="value">' + result.fleetBcf.toFixed(1) + ' Bcf/yr</span></div>' +
            '<div class="recon-summary__item"><span class="label">National reference</span><span class="value">' + result.nationalBcf.toFixed(0) + ' Bcf/yr</span></div>' +
            '<div class="recon-summary__item"><span class="label">Fleet capacity</span><span class="value">' + result.totalCapacityMW.toLocaleString() + ' MW</span></div>' +
            '</div>';

        html += '<table class="recon-table"><thead><tr>' +
            '<th>Plant</th><th>Capacity (MW)</th><th>Config</th><th>Class</th>' +
            '<th>Heat rate (BTU/kWh)</th><th>Gen (GWh/yr)</th><th>Gas (Bcf/yr)</th>' +
            '</tr></thead><tbody>';

        result.rows.forEach(function (r) {
            html += '<tr>' +
                '<td class="plant-name">' + r.name + '</td>' +
                '<td>' + r.capacityMW.toLocaleString() + '</td>' +
                '<td>' + r.config + '</td>' +
                '<td>' + r.turbineClass + '</td>' +
                '<td>' + Math.round(r.heatRate).toLocaleString() + '</td>' +
                '<td>' + r.annualGWh.toFixed(0) + '</td>' +
                '<td>' + r.gasBcf.toFixed(2) + '</td>' +
                '</tr>';
        });

        html += '</tbody></table>';

        html += '<p class="recon-note">Generation is estimated as capacity × 8,760 h × fleet utilisation; ' +
            'no per-plant generation data is published, so utilisation is the principal assumption and is exposed as a slider above. ' +
            'Heat rates are manufacturer ISO specs derated for warm-season ambient and vintage.</p>';

        return html;
    }

    return {
        // Lazy getters — the register is loaded asynchronously after this IIFE runs.
        get DEFAULT_NATIONAL_BCF() { return recon().nationalBcf.value; },
        get DEFAULT_AMBIENT_C() { return recon().defaultAmbientC; },
        compute: compute,
        generateHTML: generateHTML,
        /** Export the per-plant breakdown as CSV text. */
        toCSV: function (result) {
            var headers = ['Plant', 'Capacity (MW)', 'Config', 'Class', 'Heat rate (BTU/kWh)', 'Generation (GWh/yr)', 'Gas (Bcf/yr)'];
            var lines = [headers.join(',')];
            result.rows.forEach(function (r) {
                lines.push([
                    '"' + r.name.replace(/"/g, '""') + '"',
                    r.capacityMW, r.config, r.turbineClass,
                    Math.round(r.heatRate), r.annualGWh.toFixed(0), r.gasBcf.toFixed(3)
                ].join(','));
            });
            lines.push(['"FLEET TOTAL"', result.totalCapacityMW, '', '', '', '', result.fleetBcf.toFixed(3)].join(','));
            lines.push(['"NATIONAL REFERENCE"', '', '', '', '', '', result.nationalBcf.toFixed(3)].join(','));
            return lines.join('\n');
        }
    };
})();
